/* =================== 设置页：分类管理 + 数据导入导出 =================== */
function renderCatEditors(){
  ['expense','income'].forEach(type=>{
    const box = document.getElementById(type==='expense'?'editExpenseCats':'editIncomeCats');
    box.innerHTML = cats[type].map(c=>`<div class="cat-chip" data-editcat="${type}:${c.id}">${c.icon} ${c.name}
        <span class="x" data-rmcat="${type}:${c.id}">×</span></div>`).join('')
      + `<div class="cat-chip add" data-addcat="${type}">＋ 添加</div>`;
  });
}

document.getElementById('page-settings').addEventListener('click', e=>{
  const rm = e.target.closest('[data-rmcat]');
  if(rm){ const [type,id]=rm.dataset.rmcat.split(':');
    if(cats[type].length<=1){ showAlert('至少保留一个分类'); return; }
    openMergePicker(type, id); return; }
  const ed = e.target.closest('[data-editcat]');
  if(ed){ const [type,id]=ed.dataset.editcat.split(':'); editCategory(type,id); return; }
  const add = e.target.closest('[data-addcat]');
  if(add){ addCategory(add.dataset.addcat); }
});

function editCategory(type, id){ openCatModal({mode:'edit', type, id}); }
function addCategory(type){      openCatModal({mode:'add',  type}); }

/* 完整备份对象（记录/分类/币种/统计单位/AI 配置） */
function backupData(){
  const now = new Date();
  return {
    backupTime:now.toISOString(),
    backupTimeText:fmtDateTime(now),
    v:2, records, cats, currencies, statUnit,
    ai:{ profiles:aiProfiles, activeId:aiActiveId, activeModel:aiActiveModel },
    prefs:{
      et_cont: localStorage.getItem('et_cont'),
      et_privacy: localStorage.getItem('et_privacy'),
      et_autofocus: localStorage.getItem('et_autofocus')
    },
    exportedAt:now.toISOString()
  };
}
/* 应用一份备份对象到当前状态（导入/恢复共用） */
function applyBackup(d){
  records = d.records;
  if(d.cats) cats = d.cats;
  if(Array.isArray(d.currencies) && d.currencies.length) currencies = d.currencies;
  if(d.statUnit){ statUnit = d.statUnit; localStorage.setItem(LS_UNIT, statUnit); }
  if(d.ai && Array.isArray(d.ai.profiles) && d.ai.profiles.length){
    aiProfiles = d.ai.profiles.map(normProfile);
    aiActiveId = aiProfiles.some(p=>p.id===d.ai.activeId) ? d.ai.activeId : aiProfiles[0].id;
    aiActiveModel = d.ai.activeModel || '';
    saveProfiles();
  }
  if(d.prefs){   // 还原开关类偏好，并刷新对应 UI
    for(const k of ['et_cont','et_privacy','et_autofocus']){
      if(d.prefs[k]!=null) localStorage.setItem(k, d.prefs[k]);
    }
    if(typeof contMode!=='undefined'){ contMode = localStorage.getItem('et_cont')==='1'; renderContToggle(); }
    if(typeof autoFocus!=='undefined'){ autoFocus = localStorage.getItem('et_autofocus')!=='0'; renderAutoFocusSw(); }
    if(typeof privacyOn!=='undefined'){ privacyOn = localStorage.getItem('et_privacy')==='1'; renderEye(); }
  }
  save(); saveCur();
  renderCatEditors(); renderCurEditors(); renderAiProfiles(); renderAll();
}

function exportBackup(){
  download('记账完整备份_'+today()+'.json', JSON.stringify(backupData(),null,2));
}
document.getElementById('btnExportJson').onclick = exportBackup;

/* ---- 一键本机备份 / 恢复（存到 App 专属目录，免选文件） ---- */
const BK_DIR = 'CoinjotBackups';   // 全英文，避免路径含中文
let _lastBackupPath = '';          // 供「点击复制路径」使用
async function copyText(t){
  try{
    const C = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Clipboard;
    if(C && C.write){ await C.write({ string:t }); return true; }
    if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(t); return true; }
  }catch(e){}
  try{ const ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); return true;
  }catch(_){ return false; }
}
function nowStamp(){ const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds()); }
function fmtDateTime(d){ const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
function nativeFS(){ const c=window.Capacitor;
  return (c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.Filesystem) ? c.Plugins.Filesystem : null; }
function shortPath(uri){ return (uri||'').replace(/^file:\/\//,'').replace(/^.*?\/Android\//,'Android/'); }

function renderLastBackup(){
  const el = document.getElementById('lastBackupRow'); if(!el) return;
  const raw = localStorage.getItem('et_lastbackup');
  if(!raw){ el.textContent = '上次备份：还没有本机备份'; _lastBackupPath=''; return; }
  try{ const b = JSON.parse(raw);
    const t = new Date(b.time), p=n=>String(n).padStart(2,'0');
    _lastBackupPath = (b.uri||'').replace(/^file:\/\//,'');   // 去掉 file:// 前缀，复制真实路径
    el.innerHTML = `上次备份：${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`
      + (b.uri ? `<br><span class="loc">位置：${shortPath(b.uri)}（点此复制路径）</span>` : '');
  }catch(e){ el.textContent='上次备份：—'; _lastBackupPath=''; }
}
document.getElementById('lastBackupRow').onclick = async ()=>{
  if(!_lastBackupPath) return;
  showToast(await copyText(_lastBackupPath) ? '已复制备份路径' : '复制失败');
};

const BK_PREFIX = 'coinjot-backup-';
const BK_KEEP = 10;
const BK_META = 'et_backup_queue';
const LS_BACKUP_CHANGES = 'et_autobackup_changes';
let autoBackupBusy = false;
let backupChoices = [];
let selectedBackupIndex = -1;

function backupSlotName(slot){ return BK_PREFIX+String(slot).padStart(2,'0')+'.json'; }
function backupLabel(time){
  const t = new Date(time || Date.now());
  return Number.isNaN(t.getTime()) ? '未知时间' : fmtDateTime(t);
}
function loadBackupMeta(){
  try{
    const m = JSON.parse(localStorage.getItem(BK_META)||'');
    if(m && Array.isArray(m.items)) return {
      pointer: Number.isInteger(m.pointer) ? m.pointer : m.items.length-1,
      items: m.items.filter(x=>x && x.name).slice(0, BK_KEEP)
    };
  }catch(e){}
  return null;
}
function saveBackupMeta(meta){
  meta.items = (meta.items || []).slice(0, BK_KEEP);
  if(meta.pointer >= meta.items.length) meta.pointer = meta.items.length - 1;
  if(meta.pointer < 0 && meta.items.length) meta.pointer = meta.items.length - 1;
  localStorage.setItem(BK_META, JSON.stringify(meta));
}
function backupMetaFromFiles(files){
  const items = files.slice(0, BK_KEEP).reverse().map((f, i)=>({
    slot:i, name:f.name, time:f.mtime || Date.now(), label:backupLabel(f.mtime || Date.now()), uri:''
  }));
  return { pointer:items.length-1, items };
}
async function ensureBackupMeta(FS){
  const meta = loadBackupMeta();
  if(meta && meta.items.length) return meta;
  const files = await backupFiles(FS);
  const fresh = backupMetaFromFiles(files);
  if(fresh.items.length) saveBackupMeta(fresh);
  return fresh;
}

/* 备份滑动窗口：保留最近 10 个可恢复窗口，恢复某个窗口后从它后面继续覆盖 */
async function backupFiles(FS){
  let list = [];
  try{ list = (await FS.readdir({ directory:'EXTERNAL', path:BK_DIR })).files || []; }
  catch(e){ return []; }
  return list.map(f=> typeof f==='string'?{name:f,mtime:0}:f)
    .filter(f=>f.name && f.name.endsWith('.json'))
    .sort((a,b)=>(b.mtime||0)-(a.mtime||0) || b.name.localeCompare(a.name));
}
async function pruneBackupWindow(FS, meta){
  try{
    const keep = new Set((meta && meta.items || []).map(x=>x.name));
    const files = await backupFiles(FS);
    for(const f of files){
      if(!keep.has(f.name)) await FS.deleteFile({ directory:'EXTERNAL', path:BK_DIR+'/'+f.name });
    }
  }catch(e){}
}

async function writeLatestBackup(source){
  const text = JSON.stringify(backupData(), null, 2);
  const FS = nativeFS();
  if(!FS){
    if(source==='manual') download(BK_PREFIX+nowStamp()+'.json', text);
    return { ok:false, skipped:true, reason:'当前不是 App 环境，无法写入本机备份' };
  }
  try{
    const meta = await ensureBackupMeta(FS);
    if(meta.pointer < 0) meta.pointer = meta.items.length - 1;
    let targetIndex = meta.pointer + 1;
    let wrapped = false;
    if(meta.items.length < BK_KEEP && targetIndex > meta.items.length) targetIndex = meta.items.length;
    if(meta.items.length >= BK_KEEP && targetIndex >= BK_KEEP){ targetIndex = 0; wrapped = true; }

    const slot = (targetIndex < meta.items.length && Number.isInteger(meta.items[targetIndex].slot))
      ? meta.items[targetIndex].slot
      : firstFreeBackupSlot(meta.items);
    const name = backupSlotName(slot);
    const w = await FS.writeFile({ path:BK_DIR+'/'+name, data:text, directory:'EXTERNAL', encoding:'utf8', recursive:true });
    const item = { slot, name, time:Date.now(), label:backupLabel(Date.now()), uri:w.uri || '' };
    if(wrapped){
      meta.items.shift();
      meta.items.push(item);
      meta.pointer = meta.items.length - 1;
    }else if(targetIndex >= meta.items.length){
      meta.items.push(item);
      meta.pointer = meta.items.length - 1;
    }else{
      meta.items[targetIndex] = item;
      meta.pointer = targetIndex;
    }
    saveBackupMeta(meta);
    localStorage.setItem('et_lastbackup', JSON.stringify({ time:item.time, name:item.name, uri:item.uri }));
    await pruneBackupWindow(FS, meta); renderLastBackup();
    return { ok:true };
  }catch(e){
    if(source==='manual') showAlert('备份失败：'+(e.message||e));
    return { ok:false, reason:e.message||String(e) };
  }
}
function firstFreeBackupSlot(items){
  const used = new Set((items||[]).map(x=>x.slot).filter(Number.isInteger));
  for(let i=0;i<BK_KEEP;i++){ if(!used.has(i)) return i; }
  return 0;
}
async function backupLocal(){
  const res = await writeLatestBackup('manual');
  if(res.ok){
    localStorage.setItem(LS_BACKUP_CHANGES, '0');
    showToast('已备份到本机 ✓');
  }
}

/* 明细连续增删改满 5 次后静默自动备份，成功后计数清零 */
async function autoBackupByChanges(){
  if(autoBackupBusy) return;
  autoBackupBusy = true;
  try{
    const res = await writeLatestBackup('auto');
    if(res.ok){
      localStorage.setItem(LS_BACKUP_CHANGES, '0');
      setTimeout(()=>showToast('已自动备份到本机 ✓'), 350);
    }else if(res.skipped){
      localStorage.setItem(LS_BACKUP_CHANGES, '0');
    }else{
      setTimeout(()=>showToast('自动备份失败：'+res.reason), 350);
    }
  }finally{ autoBackupBusy = false; }
}
function noteRecordChanged(n){
  if(!nativeFS()) return;
  n = Math.max(1, Number(n)||1);
  const next = (parseInt(localStorage.getItem(LS_BACKUP_CHANGES)||'0', 10) || 0) + n;
  localStorage.setItem(LS_BACKUP_CHANGES, String(next));
  if(next >= 5) autoBackupByChanges();
}
window.noteRecordChanged = noteRecordChanged;

function renderBackupList(){
  const box = document.getElementById('backupList'); if(!box) return;
  box.innerHTML = backupChoices.map((b, i)=>`
    <button class="backup-item ${i===selectedBackupIndex?'on':''}" data-backup-i="${i}" type="button">
      <span>${b.label || backupLabel(b.time)}</span>
      <span class="sub">${i+1}/${backupChoices.length}${i===selectedBackupIndex?' · 当前选择':''}</span>
    </button>`).join('');
}
async function restoreBackupAt(index){
  const FS = nativeFS();
  const pick = backupChoices[index];
  if(!FS || !pick) return;
  if(!(await showConfirm('从这个备份恢复：\n'+(pick.label || pick.name)+'\n\n将覆盖当前所有数据，确定？'))) return;
  const r = await FS.readFile({ directory:'EXTERNAL', path:BK_DIR+'/'+pick.name, encoding:'utf8' });
  const d = JSON.parse(typeof r.data==='string'?r.data:'');
  if(!Array.isArray(d.records)) throw new Error('备份内容不正确');
  applyBackup(d);

  const meta = await ensureBackupMeta(FS);
  const metaIndex = meta.items.findIndex(x=>x.name===pick.name);
  if(metaIndex >= 0){
    meta.pointer = metaIndex;
    saveBackupMeta(meta);
  }
  localStorage.setItem('et_lastbackup', JSON.stringify({ time:pick.time || Date.now(), name:pick.name, uri:pick.uri || '' }));
  renderLastBackup();
  document.getElementById('backupModal').classList.remove('show');
  showAlert('已从本机备份恢复 ✓');
}
async function restoreLocal(){
  const FS = nativeFS();
  if(!FS){ showAlert('本机恢复仅 App 内可用；浏览器请用「从文件导入备份」'); return; }
  try{
    const meta = await ensureBackupMeta(FS);
    if(!meta.items.length){ showAlert('还没有本机备份，先点「一键备份到本机」'); return; }
    backupChoices = meta.items.slice(-BK_KEEP).reverse();
    selectedBackupIndex = 0;
    renderBackupList();
    document.getElementById('backupModal').classList.add('show');
  }catch(e){ showAlert('恢复失败：'+(e.message||e)); }
}
document.getElementById('btnBackupLocal').onclick = backupLocal;
document.getElementById('btnRestoreLocal').onclick = restoreLocal;
document.getElementById('backupCancel').onclick = ()=>document.getElementById('backupModal').classList.remove('show');
document.getElementById('backupList').onclick = e=>{
  const el = e.target.closest('[data-backup-i]'); if(!el) return;
  selectedBackupIndex = Number(el.dataset.backupI);
  renderBackupList();
};
document.getElementById('backupRestore').onclick = async ()=>{
  try{ await restoreBackupAt(selectedBackupIndex); }
  catch(e){ showAlert('恢复失败：'+(e.message||e)); }
};
document.getElementById('backupModal').onclick = e=>{
  if(e.target.id==='backupModal') e.currentTarget.classList.remove('show');
};
renderLastBackup();
document.getElementById('btnExportCsv').onclick=()=>{
  const head='日期,类型,分类,币种,金额,备注\n';
  const rows=records.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r=>{
    const c=catById(r.type,r.categoryId);
    return [r.date.slice(0,10), r.type==='expense'?'支出':'收入', c.name,
            (r.currency||'cny').toUpperCase(), r.amount,
            '"'+(r.note||'').replace(/"/g,'""')+'"'].join(',');
  }).join('\n');
  download('记账明细_'+today()+'.csv', '﻿'+head+rows);
};
document.getElementById('btnImport').onclick=()=>document.getElementById('importFile').click();
document.getElementById('importFile').onchange=e=>{
  const f=e.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=()=>{ try{ const d=JSON.parse(r.result);
    if(!Array.isArray(d.records)) throw 0;
    showConfirm('导入将覆盖当前所有数据（含 AI 配置、币种设置），确定？').then(ok=>{
      if(!ok) return;
      applyBackup(d);
      showAlert('导入成功');
    });
  }catch(err){ showAlert('文件格式不正确'); } };
  r.readAsText(f); e.target.value='';
};
document.getElementById('btnClear').onclick=async ()=>{
  if(await showConfirm('确定清空所有记账数据？\n清空前会自动备份到本机（可随时恢复）')){
    await backupLocal();   // 先自动备份到本机，防手滑
    records=[]; cats=JSON.parse(JSON.stringify(DEFAULT_CATS)); save(); renderCatEditors(); renderAll();
    showToast('已清空 · 已自动备份到本机');
  }
};

async function download(name, text){
  const cap = window.Capacitor;
  // App 内：写文件 + 系统分享（WebView 不支持 blob 下载）
  if(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem){
    try{
      const FS = cap.Plugins.Filesystem, Share = cap.Plugins.Share;
      const w = await FS.writeFile({ path:name, data:text, directory:'CACHE', encoding:'utf8' });
      if(Share && Share.share) await Share.share({ title:name, text:'记账导出', files:[w.uri] });
      else showToast('已保存到：'+w.uri);
    }catch(e){ showAlert('导出失败：'+(e.message||e)); }
    return;
  }
  // 浏览器：常规下载
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'})); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* ---- 删除分类：选择并入的目标分类 ---- */
const cpick = document.getElementById('cpick');
let pendingDel = null;   // {type, id}
function openMergePicker(type, id){
  pendingDel = {type, id};
  const n = records.filter(r=>r.type===type && r.categoryId===id).length;
  document.getElementById('cpickTitle').textContent =
    `删除「${catById(type,id).name}」，${n} 条记录并入：`;
  document.getElementById('cpickGrid').innerHTML = cats[type]
    .filter(c=>c.id!==id)
    .map(c=>`<div class="cat-chip" data-mergeto="${c.id}">${c.icon} ${c.name}</div>`).join('');
  cpick.classList.add('show');
}
cpick.onclick = e=>{
  if(e.target===cpick){ cpick.classList.remove('show'); pendingDel=null; return; }
  const t = e.target.closest('[data-mergeto]');
  if(t && pendingDel){
    const {type, id} = pendingDel, target = t.dataset.mergeto;
    let changed = 0;
    records.forEach(r=>{ if(r.type===type && r.categoryId===id){ r.categoryId=target; changed++; } });
    cats[type] = cats[type].filter(c=>c.id!==id);
    save(); if(changed) noteRecordChanged(changed); renderCatEditors(); renderAll();
    cpick.classList.remove('show'); pendingDel=null;
  }
};

/* ---- 自定义「新建/编辑分类」弹窗（名称 + emoji 选择 + 自动推荐） ---- */
const PALETTE = ['#ff7a59','#ff5a8a','#4aa3ff','#7c6cff','#ffb020','#2ec8a0','#16a3b8','#11b886','#ff9f43','#54a0ff','#ee5253','#5f27cd'];
const EMOJIS = ['🍜','🍔','🍚','🍱','🍰','🍎','🍿','🥬','🛒','🛍️','🥤','☕','🍺','🍷',
  '👕','👗','👟','🧥','💄','💈','🚌','🚗','🚕','⛽','✈️','🏨','🏠','🏦','🛋️','🔧',
  '💡','🔌','📱','💻','🖥️','🎮','🎬','🎵','🎤','🏃','⚽','🏊','💊','🏥','📚','✏️',
  '🎓','🐾','🐶','🐱','🍼','🧸','🎁','💰','💸','📈','💳','🧾','🌷','☂️','🚬','🪙'];
const catModal = document.getElementById('catModal');
let cmCtx = null, cmSel = '🏷️';
function openCatModal(ctx){
  cmCtx = ctx;
  const c = ctx.mode==='edit' ? cats[ctx.type].find(x=>x.id===ctx.id) : null;
  document.getElementById('cmTitle').textContent = ctx.mode==='edit' ? '编辑分类' : '新建分类';
  document.getElementById('cmName').value = c ? c.name : '';
  cmSel = c ? c.icon : '🏷️';
  renderCmPal();
  catModal.classList.add('show');
}
function renderCmPal(){
  document.getElementById('cmIcon').textContent = cmSel;
  document.getElementById('cmPal').innerHTML =
    EMOJIS.map(e=>`<div class="em${e===cmSel?' on':''}" data-em="${e}">${e}</div>`).join('');
}
document.getElementById('cmPal').onclick = e=>{
  const el = e.target.closest('[data-em]'); if(!el) return;
  cmSel = el.dataset.em; renderCmPal();
};
document.getElementById('cmAuto').onclick = async ()=>{
  const name = document.getElementById('cmName').value.trim(); if(!name) return;
  let icon = guessIcon(name); if(!icon) icon = await aiPickEmoji(name);
  if(icon){ cmSel = icon; renderCmPal(); }
};
function closeCatModal(){ catModal.classList.remove('show'); cmCtx = null; }
document.getElementById('cmCancel').onclick = closeCatModal;
catModal.onclick = e=>{ if(e.target===catModal) closeCatModal(); };
document.getElementById('cmSave').onclick = ()=>{
  if(!cmCtx) return;
  const name = document.getElementById('cmName').value.trim();
  if(!name){ showAlert('请输入分类名称'); return; }
  if(cmCtx.mode==='edit'){
    const c = cats[cmCtx.type].find(x=>x.id===cmCtx.id); if(c){ c.name=name; c.icon=cmSel; }
  } else {
    cats[cmCtx.type].push({ id:'c'+Date.now(), name, icon:cmSel,
      color:PALETTE[cats[cmCtx.type].length % PALETTE.length] });
  }
  save(); renderCatEditors(); renderAll(); closeCatModal();
};
