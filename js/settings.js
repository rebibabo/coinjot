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
    if(cats[type].length<=1){ alert('至少保留一个分类'); return; }
    openMergePicker(type, id); return; }
  const ed = e.target.closest('[data-editcat]');
  if(ed){ const [type,id]=ed.dataset.editcat.split(':'); editCategory(type,id); return; }
  const add = e.target.closest('[data-addcat]');
  if(add){ addCategory(add.dataset.addcat); }
});

function editCategory(type, id){ openCatModal({mode:'edit', type, id}); }
function addCategory(type){      openCatModal({mode:'add',  type}); }

function exportBackup(){
  const data = {
    v:2, records, cats, currencies, statUnit,
    ai:{ profiles:aiProfiles, activeId:aiActiveId, activeModel:aiActiveModel },
    exportedAt:new Date().toISOString()
  };
  download('记账完整备份_'+today()+'.json', JSON.stringify(data,null,2));
}
document.getElementById('btnExportJson').onclick = exportBackup;
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
    if(confirm('导入将覆盖当前所有数据（含 AI 配置、币种设置），确定？')){
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
      save(); saveCur();
      renderCatEditors(); renderCurEditors(); renderAiProfiles(); renderAll();
      alert('导入成功');
    }
  }catch(err){ alert('文件格式不正确'); } };
  r.readAsText(f); e.target.value='';
};
document.getElementById('btnClear').onclick=()=>{
  if(confirm('确定清空所有记账数据？\n清空前会自动导出一份完整备份')){
    exportBackup();   // 先自动备份，防手滑
    records=[]; cats=JSON.parse(JSON.stringify(DEFAULT_CATS)); save(); renderCatEditors(); renderAll();
    showToast('已清空 · 备份已下载');
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
    }catch(e){ alert('导出失败：'+(e.message||e)); }
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
    records.forEach(r=>{ if(r.type===type && r.categoryId===id) r.categoryId=target; });
    cats[type] = cats[type].filter(c=>c.id!==id);
    save(); renderCatEditors(); renderAll();
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
  if(!name){ alert('请输入分类名称'); return; }
  if(cmCtx.mode==='edit'){
    const c = cats[cmCtx.type].find(x=>x.id===cmCtx.id); if(c){ c.name=name; c.icon=cmSel; }
  } else {
    cats[cmCtx.type].push({ id:'c'+Date.now(), name, icon:cmSel,
      color:PALETTE[cats[cmCtx.type].length % PALETTE.length] });
  }
  save(); renderCatEditors(); renderAll(); closeCatModal();
};
