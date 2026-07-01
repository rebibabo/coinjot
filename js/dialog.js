/* =================== 统一自定义弹窗（替代系统 alert/confirm） ===================
   showAlert(msg, title?)   -> Promise<true>        单个「知道了」
   showConfirm(msg, title?) -> Promise<bool>        「取消 / 确定」
   返回 Promise，可 await；即弃即用也行（如 showAlert('x'); return;）。 */
let _dlgResolve = null;
const _dlg = () => document.getElementById('appDialog');

function _openDlg(msg, opts){
  const t = document.getElementById('dlgTitle');
  if(opts.title){ t.textContent = opts.title; t.style.display=''; } else t.style.display='none';
  document.getElementById('dlgMsg').textContent = msg;
  const box = document.getElementById('dlgBtns');
  box.innerHTML = opts.buttons.map((b,i)=>`<button class="mb ${b.cls}" data-i="${i}">${b.label}</button>`).join('');
  box.querySelectorAll('button').forEach(btn=>
    btn.onclick = ()=> _settleDlg(opts.buttons[+btn.dataset.i].value));
  _dlg().classList.add('show');
}
/* 结算并关闭：兑现 Promise，供按钮/返回键/点背景调用 */
function _settleDlg(v){
  _dlg().classList.remove('show');
  if(_dlgResolve){ const r=_dlgResolve; _dlgResolve=null; r(v); }
}
window._settleDlg = _settleDlg;   // 供 app.js 的返回键逻辑关闭

function showAlert(msg, title){
  return new Promise(res=>{ _dlgResolve=res;
    _openDlg(msg, { title, buttons:[{label:'知道了', cls:'ok', value:true}] }); });
}
function showConfirm(msg, title){
  return new Promise(res=>{ _dlgResolve=res;
    _openDlg(msg, { title, buttons:[
      {label:'取消', cls:'cancel', value:false},
      {label:'确定', cls:'ok',     value:true}
    ] }); });
}

/* 点背景关闭 = 取消 */
_dlg().onclick = e=>{ if(e.target.id==='appDialog') _settleDlg(false); };
