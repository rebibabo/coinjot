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

/* App 内：状态栏不覆盖网页、用深色底配白图标，避开刘海/状态栏（需 @capacitor/status-bar） */
if(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar){
  const SB = window.Capacitor.Plugins.StatusBar;
  SB.setOverlaysWebView({ overlay:false }).catch(()=>{});
  SB.setBackgroundColor({ color:'#0e0f12' }).catch(()=>{});
  SB.setStyle({ style:'LIGHT' }).catch(()=>{});   // 深色背景 → 白色状态栏图标
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

/* 缩放适配：把 1200x2670 画布塞进当前窗口 */
function fitStage(){
  const stage=document.getElementById('stage');
  const s=Math.min(window.innerWidth/1200, window.innerHeight/2670);
  stage.style.transform=`translate(-50%,-50%) scale(${s})`;
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
