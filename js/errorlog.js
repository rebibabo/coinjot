/* =================== 轻量错误日志 ===================
   全局兜底 window.onerror / unhandledrejection，最近 200 条存 localStorage（环形覆盖）。
   设置页「关于 → 错误日志」可查看/清空。 */
const LS_ERRLOG = 'et_errorlog', ERRLOG_MAX = 200;

function logError(msg, src){
  try{
    const arr = JSON.parse(localStorage.getItem(LS_ERRLOG) || '[]');
    arr.push({ t:Date.now(), m:String(msg||'').slice(0,600), s:String(src||'').slice(0,200) });
    while(arr.length > ERRLOG_MAX) arr.shift();
    localStorage.setItem(LS_ERRLOG, JSON.stringify(arr));
  }catch(e){}
}
window.addEventListener('error', e=>{
  logError(e.message || (e.error && e.error.message) || e.error, (e.filename||'') + (e.lineno?(':'+e.lineno):''));
});
window.addEventListener('unhandledrejection', e=>{
  const r = e.reason; logError('未处理的 Promise：' + ((r && r.message) || r), 'promise');
});

/* ---- 查看 ---- */
function _fmtLogTime(t){ const d=new Date(t), p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function renderLog(){
  const arr = (()=>{ try{ return JSON.parse(localStorage.getItem(LS_ERRLOG)||'[]'); }catch(_){ return []; } })();
  const box = document.getElementById('logList'); if(!box) return;
  if(!arr.length){ box.innerHTML = '<p class="log-empty">暂无错误记录 🎉</p>'; return; }
  box.innerHTML = arr.slice().reverse().map(e=>
    `<div class="log-item"><div class="log-time">${_fmtLogTime(e.t)}</div>
      <div class="log-msg">${esc(e.m)}</div>${e.s?`<div class="log-src">${esc(e.s)}</div>`:''}</div>`).join('');
}
function openLog(){ renderLog(); document.getElementById('logSheet').classList.add('show'); }
function closeLog(){ document.getElementById('logSheet').classList.remove('show'); }
document.getElementById('btnErrLog').onclick = openLog;
document.getElementById('logBack').onclick = closeLog;
document.getElementById('logClear').onclick = async ()=>{
  if(await showConfirm('清空全部错误日志？')){ localStorage.removeItem(LS_ERRLOG); renderLog(); }
};
