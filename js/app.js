/* =================== 全局交互 + 缩放适配 + 启动 ===================
   最后加载：此时各模块的渲染/处理函数都已就绪。 */

/* 月份切换：左右逐月，或点中间标签直接选任意年月 */
document.getElementById('prevMonth').onclick=()=>{ if(--viewMonth<0){viewMonth=11;viewYear--;} renderAll(); };
document.getElementById('nextMonth').onclick=()=>{ if(++viewMonth>11){viewMonth=0;viewYear++;} renderAll(); };
/* 点中间标签 → 自定义年月面板（跨浏览器/WebView 稳定） */
const mpick = document.getElementById('mpick');
let mpYear = viewYear;
function openMonthPicker(){ mpYear = viewYear; renderMonthGrid(); mpick.classList.add('show'); }
function renderMonthGrid(){
  document.getElementById('mpYear').textContent = mpYear + '年';
  document.getElementById('mpGrid').innerHTML =
    Array.from({length:12}, (_,i)=>
      `<div class="m${mpYear===viewYear && i===viewMonth ? ' on':''}" data-m="${i}">${i+1}月</div>`
    ).join('');
}
document.getElementById('monthLabel').onclick = openMonthPicker;
document.getElementById('mpPrevY').onclick = ()=>{ mpYear--; renderMonthGrid(); };
document.getElementById('mpNextY').onclick = ()=>{ mpYear++; renderMonthGrid(); };
mpick.onclick = e=>{
  if(e.target===mpick){ mpick.classList.remove('show'); return; }
  const cell = e.target.closest('[data-m]');
  if(cell){ viewYear = mpYear; viewMonth = +cell.dataset.m; mpick.classList.remove('show'); renderAll(); }
};

/* 底部 Tab 切换（顶部汇总栏只在明细/统计显示，"我的"页隐藏） */
const topbar = document.querySelector('.topbar');
function goTab(name){
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  if(tab) tab.classList.add('on');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  topbar.style.display = name==='settings' ? 'none' : '';
  setStatusBar(name);
  if(name!=='settings') renderTop();   // 顶栏可见后重算金额字号（避免隐藏时量不到宽）
}
document.querySelectorAll('.tab[data-tab]').forEach(t=> t.onclick=()=>goTab(t.dataset.tab));

/* ===== 返回键：逐层关闭弹层 → 回明细 → 退出 ===== */
const BACK_LAYERS = ['catModal','aiModal','rateModal','curModal','filterModal','dpick','mpick','cpick','sheet'];
function handleBack(){
  for(const id of BACK_LAYERS){
    const el = document.getElementById(id);
    if(el && el.classList.contains('show')){ el.classList.remove('show'); return true; }
  }
  return false;   // 没有可关的弹层
}
/* 安卓硬件返回键（App 内有效，需 @capacitor/app；浏览器里没有此事件） */
if(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App){
  const App = window.Capacitor.Plugins.App;
  App.addListener('backButton', ()=>{
    if(handleBack()) return;                                   // 先关最上层弹层
    const cur = document.querySelector('.tab.on')?.dataset?.tab;
    if(cur && cur!=='list'){ goTab('list'); return; }          // 不在明细 → 回明细
    App.exitApp();                                             // 已在明细且无弹层 → 退出
  });
}
/* 桌面/浏览器预览：Esc 等效返回键，方便测试 */
document.addEventListener('keydown', e=>{ if(e.key==='Escape') handleBack(); });

/* App 内：状态栏不覆盖网页，颜色随页面变（避开刘海） */
function setStatusBar(name){
  const SB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
  if(!SB) return;
  SB.setOverlaysWebView({ overlay:false }).catch(()=>{});
  if(name==='settings'){ SB.setBackgroundColor({color:'#f4f5f7'}).catch(()=>{}); SB.setStyle({style:'DARK'}).catch(()=>{}); }
  else { SB.setBackgroundColor({color:'#3c7dff'}).catch(()=>{}); SB.setStyle({style:'LIGHT'}).catch(()=>{}); }
}
setStatusBar('list');

/* 键盘弹出时（resize:none，界面不被压缩），把当前输入框上移到键盘之上；收起复位 */
if(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard){
  const KB = window.Capacitor.Plugins.Keyboard;
  KB.addListener('keyboardWillShow', info=>{
    const ae = document.activeElement;
    if(!ae || !/INPUT|TEXTAREA/.test(ae.tagName)) return;
    const kb = info.keyboardHeight || 0;
    const overlap = ae.getBoundingClientRect().bottom - (window.innerHeight - kb) + 40;
    if(overlap > 0) document.getElementById('stage').style.top = (-overlap) + 'px';
  });
  KB.addListener('keyboardWillHide', ()=> fitStage());   // 复位
}

/* 轻提示 toast：可带一个操作按钮（如「撤销」） */
let toastTimer = null;
function showToast(msg, actLabel, actFn, ms=4000){
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${msg}</span>` + (actLabel ? `<button id="toastAct">${actLabel}</button>` : '');
  el.classList.add('show');
  if(actLabel) document.getElementById('toastAct').onclick = ()=>{ hideToast(); actFn && actFn(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, ms);
}
function hideToast(){ document.getElementById('toast').classList.remove('show'); }

/* 缩放适配：
   手机竖屏 → 按宽度铺满整屏，高度按视口自适应（内部 flex 布局自动伸展）；
   桌面/横向 → 居中等比缩放（letterbox），方便预览。 */
function fitStage(){
  const stage = document.getElementById('stage');
  const phone = document.querySelector('.phone');
  const W = window.innerWidth, H = window.innerHeight;
  if(W/H >= 1){                        // 偏横（桌面）→ 居中 letterbox，固定高 2670
    phone.style.width = '1200px'; phone.style.height = '2670px';
    const s = Math.min(W/1200, H/2670);
    stage.style.transformOrigin = 'center center';
    stage.style.left = '50%'; stage.style.top = '50%';
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  } else {                             // 竖屏（手机）→ 按宽铺满，高度自适应
    const s = W/1200;
    phone.style.width = '1200px'; phone.style.height = (H/s) + 'px';
    stage.style.transformOrigin = 'top left';
    stage.style.left = '0'; stage.style.top = '0';
    stage.style.transform = `scale(${s})`;
  }
}
window.addEventListener('resize', fitStage);

/* 关闭所有输入框的拼写检查红线 / 自动填充建议（小人图标） */
document.querySelectorAll('input:not([type=file]), textarea').forEach(el=>{
  el.spellcheck = false;
  el.setAttribute('autocomplete', 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('autocapitalize', 'off');
});

/* 启动 */
renderCatEditors();
renderCurEditors();
renderAiProfiles();
renderAll();
fitStage();
updateRates();   // 每天首次打开自动拉取汇率（当天已更新则跳过）
