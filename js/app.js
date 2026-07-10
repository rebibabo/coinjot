/* =================== 全局交互 + 缩放适配 + 启动 ===================
   最后加载：此时各模块的渲染/处理函数都已就绪。 */

/* 月份切换：左右逐月，或点中间标签直接选任意年月 */
document.getElementById('prevMonth').onclick=()=>{ if(--viewMonth<0){viewMonth=11;viewYear--;} clearStatSelection(); renderAll(); scrollMainTo('top'); };
document.getElementById('nextMonth').onclick=()=>{ if(++viewMonth>11){viewMonth=0;viewYear++;} clearStatSelection(); renderAll(); scrollMainTo('top'); };
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
  if(cell){ viewYear = mpYear; viewMonth = +cell.dataset.m; clearStatSelection(); mpick.classList.remove('show'); renderAll(); scrollMainTo('top'); }
};

/* 底部 Tab 切换（顶部汇总栏只在明细/统计显示，"我的"页隐藏） */
const topbar = document.querySelector('.topbar');
const mainBody = document.querySelector('.body');
const tabScrollTop = { list:0, stats:0, settings:0 };
let currentTab = 'list';
function scrollMainTo(pos){
  if(!mainBody) return;
  const apply = ()=>{ mainBody.scrollTop = pos==='bottom' ? mainBody.scrollHeight : 0; };
  apply();
  requestAnimationFrame(apply);
}
function saveTabScroll(){
  if(currentTab && mainBody) tabScrollTop[currentTab] = mainBody.scrollTop;
}
function restoreTabScroll(name){
  if(!mainBody) return;
  const y = tabScrollTop[name] || 0;
  mainBody.scrollTop = y;
  requestAnimationFrame(()=>{ mainBody.scrollTop = y; });
}
function goTab(name){
  saveTabScroll();
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  if(tab) tab.classList.add('on');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  const isSettings = name==='settings';
  topbar.style.display = isSettings ? 'none' : '';
  if(isSettings) updateSettingsPadding();
  setStatusBar(name);
  if(!isSettings) renderTop();
  if(name==='stats' && typeof restartTrendAnimations==='function') restartTrendAnimations();
  currentTab = name;
  restoreTabScroll(name);
}
document.querySelectorAll('.tab[data-tab]').forEach(t=> t.onclick=()=>goTab(t.dataset.tab));

/* ===== 内置教程帮助页：问号打开，离线可看 ===== */
const helpSheet = document.getElementById('helpSheet');
function openHelp(){
  helpSheet.scrollTop = 0;
  const body = helpSheet.querySelector('.help-body'); if(body) body.scrollTop = 0;
  helpSheet.classList.add('show');
  const SB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
  if(SB){ SB.setBackgroundColor({color:'#3c7dff'}).catch(()=>{}); SB.setStyle({style:'LIGHT'}).catch(()=>{}); }
}
function closeHelp(){
  helpSheet.classList.remove('show');
  setStatusBar(document.querySelector('.tab.on')?.dataset?.tab || 'settings');  // 还原状态栏
}
document.getElementById('helpBtn').onclick = openHelp;
document.getElementById('helpBack').onclick = closeHelp;

/* ===== 返回键：逐层关闭弹层 → 回明细 → 退出 ===== */
const BACK_LAYERS = ['appDialog','updModal','catModal','aiModal','rateModal','backupModal','curModal','tplModal','dpick','filterModal','mpick','cpick','sheet','helpSheet','logSheet'];
function handleBack(){
  for(const id of BACK_LAYERS){
    const el = document.getElementById(id);
    if(el && el.classList.contains('show')){
      if(id==='helpSheet') closeHelp();
      else if(id==='appDialog') _settleDlg(false);
      else el.classList.remove('show');
      return true;
    }
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

/* App 内：状态栏不覆盖网页，颜色随页面变 */
function setStatusBar(name){
  const SB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
  if(!SB) return;
  SB.setOverlaysWebView({ overlay:false }).catch(()=>{});
  if(name==='settings'){ SB.setBackgroundColor({color:'#f4f5f7'}).catch(()=>{}); SB.setStyle({style:'LIGHT'}).catch(()=>{}); }
  else { SB.setBackgroundColor({color:'#3c7dff'}).catch(()=>{}); SB.setStyle({style:'LIGHT'}).catch(()=>{}); }
}
setStatusBar('list');

/* 隐私模式：点眼睛把所有金额变 ¥•••• */
const eyeToggle = document.getElementById('eyeToggle');
function renderEye(){ eyeToggle.textContent = privacyOn ? '🙈' : '🐵'; }   // 🐵显示 / 🙈隐藏
eyeToggle.onclick = ()=>{
  privacyOn = !privacyOn;
  localStorage.setItem('et_privacy', privacyOn ? '1' : '0');
  renderEye(); renderAll();
};
renderEye();

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

/* ===== 缩放适配 + 安全区（刘海/灵动岛/底部指示条） =====
   手机竖屏 → 按宽度铺满整屏，高度按视口自适应（内部 flex 布局自动伸展）；
   桌面/横向 → 居中等比缩放（letterbox），方便预览。
   安全区通过 CSS env() + 原生注入综合获取，换算为设计画布像素后写入 CSS 变量。
   所有元素（topbar / help-top / tabbar / 设置页）统一用这些变量消隐安全区。 */
let baseH = 0;   // 没有键盘时的完整视口高度（键盘弹出会把 innerHeight 压小）
let _cachedEnvInsets = null;  // 缓存 env(safe-area-inset-*) 的读取（不会变）

/* 读取浏览器 CSS env(safe-area-inset-*) → {top, bottom} CSS 像素。
   只在 overlay 模式下有值；overlay:false 时为 0。 */
function readEnvInsets(){
  if(_cachedEnvInsets) return _cachedEnvInsets;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;opacity:0;' +
    'padding-top:env(safe-area-inset-top,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);';
  document.body.appendChild(d);
  const cs = getComputedStyle(d);
  _cachedEnvInsets = {
    top: parseInt(cs.paddingTop) || 0,
    bottom: parseInt(cs.paddingBottom) || 0,
  };
  document.body.removeChild(d);
  return _cachedEnvInsets;
}

/* 顶部安全区高度（CSS 像素）：优先从 env() 拿，没有则用原生注入，都没有则兜底 24 */
function readTopSafePx(){
  let px = readEnvInsets().top;
  if(!px) px = window.__statusBarHeight || 0;
  if(!px && window.visualViewport) px = window.visualViewport.offsetTop;
  if(!px) px = 24;
  return px;
}

/* 底部安全区高度（CSS 像素）：env(safe-area-inset-bottom) */
function readBottomSafePx(){
  return readEnvInsets().bottom;
}

/* 把安全区高度→设计画布像素（÷缩放比），写入 CSS 变量供各处使用 */
function applySafeAreaVars(s){
  const topDp = Math.round(readTopSafePx() / s);
  const botDp = Math.round(readBottomSafePx() / s);
  const root = document.documentElement;
  root.style.setProperty('--safe-top-px', topDp + 'px');
  root.style.setProperty('--safe-bot-px', botDp + 'px');
  root.style.setProperty('--topbar-pt', (50 + topDp) + 'px');
  root.style.setProperty('--help-top-pt', (46 + topDp) + 'px');
}

function fitStage(){
  const stage = document.getElementById('stage');
  const phone = document.querySelector('.phone');
  const W = window.innerWidth, H = window.innerHeight;
  if(H > baseH) baseH = H;
  // 键盘弹出导致视口骤缩（>120px）时，仍按完整高度布局，界面不被顶起/压缩
  const effH = (H < baseH - 120) ? baseH : H;
  if(W/effH >= 1){                     // 偏横（桌面）→ 居中 letterbox，固定高 2670
    phone.style.width = '1200px'; phone.style.height = '2670px';
    const s = Math.min(W/1200, effH/2670);
    stage.style.transformOrigin = 'center center';
    stage.style.left = '50%'; stage.style.top = '50%';
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
    // 横屏 letterbox：手机居中，顶部安全区不适用，清零
    const root = document.documentElement;
    root.style.setProperty('--safe-top-px', '0px');
    root.style.setProperty('--safe-bot-px', '0px');
    root.style.setProperty('--topbar-pt', '50px');
    root.style.setProperty('--help-top-pt', '46px');
  } else {                             // 竖屏（手机）→ 按宽铺满，高度自适应
    const s = W/1200;
    applySafeAreaVars(s);
    // phone 撑满整个视口；安全区由各元素的 padding（CSS 变量）消化
    phone.style.width = '1200px';
    phone.style.height = (effH / s) + 'px';
    stage.style.transformOrigin = 'top left';
    stage.style.left = '0'; stage.style.top = '0';
    stage.style.transform = `scale(${s})`;
  }
  updateSettingsPadding();
  stage.style.visibility = 'visible';   // 缩放就位后再显示，消除开屏闪烁
}
function updateSettingsPadding(){
  const page = document.getElementById('page-settings');
  if(!page || !page.classList.contains('active')) return;
  const s = window.innerWidth / 1200;
  page.style.paddingTop = Math.round(readTopSafePx() / s + 70) + 'px';
}
// 安全区变量可能在首帧 / 原生注入之后才到位，轮询补刀
setTimeout(()=>{ applySafeAreaVars(window.innerWidth/1200); updateSettingsPadding(); }, 300);
setTimeout(()=>{ applySafeAreaVars(window.innerWidth/1200); updateSettingsPadding(); }, 800);
setTimeout(()=>{ applySafeAreaVars(window.innerWidth/1200); updateSettingsPadding(); }, 2000);
window.addEventListener('resize', ()=>{ _cachedEnvInsets = null; fitStage(); });
window.addEventListener('orientationchange', ()=>{ baseH = 0; _cachedEnvInsets = null; setTimeout(fitStage, 100); });

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
