/* =================== 记账弹层：收支切换 + 分类网格 + 数字键盘 =================== */
const sheet=document.getElementById('sheet');
const sheetInner=sheet.querySelector('.sheet-inner');
const LS_LASTCUR='et_lastcur';
let entryType='expense', entryCat=null, amtStr='0', entryDate=today(), entryCur='cny';
let editingId=null;   // null=新增，否则=正在编辑的记录 id

/* 记住上次用过的币种（仍在配置列表里才采用，否则回退人民币） */
function lastCur(){ const c=localStorage.getItem(LS_LASTCUR); return currencies.some(x=>x.code===c) ? c : 'cny'; }

/* 币种按钮：点一下切到下一个已配置币种；只有 1 种时隐藏 */
function updateCurBtn(){
  const b=document.getElementById('curBtn');
  b.textContent = curInfo(entryCur).symbol;
  b.style.display = currencies.length>1 ? '' : 'none';
}
document.getElementById('curBtn').onclick=()=>{
  const idx = currencies.findIndex(c=>c.code===entryCur);
  entryCur = currencies[(idx+1) % currencies.length].code;
  localStorage.setItem(LS_LASTCUR, entryCur);   // 记住选择
  updateCurBtn();
};

/* 连续记账：开后存完一笔不关弹层，接着记下一笔 */
let contMode = localStorage.getItem('et_cont')==='1';
const contToggle = document.getElementById('contToggle');
function renderContToggle(){ contToggle.classList.toggle('on', contMode); }
contToggle.onclick=()=>{ contMode=!contMode; localStorage.setItem('et_cont', contMode?'1':'0'); renderContToggle(); };
renderContToggle();

document.getElementById('tabAdd').onclick=()=>openSheet();
/* 传入 rec 进入编辑模式（预填该记录），不传则为新增 */
function openSheet(rec){
  editingId = rec ? rec.id : null;
  sheetInner.classList.toggle('editing', !!rec);
  if(rec){
    entryDate = rec.date.slice(0,10);
    entryCur = rec.currency || 'cny';
    setType(rec.type);                 // 先重建分类网格
    entryCat = rec.categoryId; highlightCat();   // 再覆盖为该记录分类
    amtStr = String(rec.amount);
    document.getElementById('noteIn').value = rec.note || '';
  } else {
    entryType='expense'; amtStr='0'; entryDate=today(); entryCur=lastCur();
    document.getElementById('noteIn').value='';
    setType('expense');
  }
  updateAmt(); updateDateBtn(); updateCurBtn();
  sheet.classList.add('show');
}
function closeSheet(){ sheet.classList.remove('show'); }
sheet.onclick=e=>{ if(e.target===sheet) closeSheet(); };

document.getElementById('sheetDel').onclick=()=>{
  if(!editingId) return;
  const idx = records.findIndex(r=>r.id===editingId);
  if(idx<0) return;
  const removed = records[idx];
  records.splice(idx,1); save(); closeSheet(); renderAll();
  showToast('已删除', '撤销', ()=>{ records.splice(idx,0,removed); save(); renderAll(); });
};

document.querySelectorAll('.type-toggle button').forEach(b=>{
  b.onclick=()=>setType(b.dataset.type);
});
function setType(type){
  entryType=type;
  document.querySelectorAll('.type-toggle button').forEach(b=>{
    b.className=''; if(b.dataset.type===type) b.classList.add('on',type);
  });
  document.getElementById('keySave').classList.toggle('income', type==='income');
  renderCatGrid();
}
function renderCatGrid(){
  const grid=document.getElementById('catGrid');
  grid.innerHTML=cats[entryType].map(c=>`<div class="cat-cell" data-cid="${c.id}">
    <div class="cc-ico" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
    <div class="cc-nm">${c.name}</div></div>`).join('');
  entryCat = cats[entryType][0]?.id || null;
  highlightCat();
  grid.querySelectorAll('.cat-cell').forEach(cell=>{
    cell.onclick=()=>{ entryCat=cell.dataset.cid; highlightCat(); };
  });
}
function highlightCat(){
  document.querySelectorAll('#catGrid .cat-cell').forEach(c=>
    c.classList.toggle('on', c.dataset.cid===entryCat));
}

/* 金额键盘 —— 支持 + / − 简单运算 */
document.querySelectorAll('.keypad .key').forEach(k=>{
  k.onclick=()=>{
    if(k.id==='keySave'){ commitEntry(); return; }
    const op=k.dataset.op;
    if(op==='del'){ amtStr=amtStr.length>1?amtStr.slice(0,-1):'0'; }
    else if(op==='clear'){ amtStr='0'; }
    else if(op==='plus'||op==='minus'){
      amtStr=evalAmt(); if(!/[+\-]$/.test(amtStr)) amtStr+= (op==='plus'?'+':'-');
    }
    else { // 数字或小数点
      const ch=k.textContent;
      if(ch==='.'){ const seg=lastSeg(amtStr); if(seg.includes('.')) return; amtStr+='.'; }
      else { if(amtStr==='0') amtStr=ch; else amtStr+=ch; }
    }
    updateAmt();
  };
});
function lastSeg(s){ return s.split(/[+\-]/).pop(); }
function evalAmt(){
  let s=amtStr.replace(/[+\-]$/,'');
  try{ if(/[+\-]/.test(s)){ const v=Function('return '+s)(); return String(Math.round(v*100)/100); } }catch(e){}
  return s;
}
function updateAmt(){
  document.getElementById('showAmt').textContent = amtStr;
  const conv = document.getElementById('amtConv');
  const v = Number(evalAmt());
  conv.textContent = (v>0 && entryCur!==statUnit) ? '≈ ' + fmt(toUnit(v, entryCur), unitSymbol()) : '';
}
function updateDateBtn(){
  const b=document.getElementById('dateBtn');
  b.textContent = entryDate===today() ? '今天' : entryDate.slice(5).replace('-','/');
}
/* 自定义中文日历 */
const dpick=document.getElementById('dpick');
let dpYear, dpMonth;
document.getElementById('dateBtn').onclick=()=>{
  const [y,m]=entryDate.split('-').map(Number);
  dpYear=y; dpMonth=m-1; renderDateGrid(); dpick.classList.add('show');
};
function renderDateGrid(){
  document.getElementById('dpTitle').textContent = `${dpYear}年${dpMonth+1}月`;
  const first = new Date(dpYear, dpMonth, 1).getDay();
  const days  = new Date(dpYear, dpMonth+1, 0).getDate();
  let cells='';
  for(let i=0;i<first;i++) cells+='<span></span>';
  for(let d=1;d<=days;d++){
    const ds = `${dpYear}-${String(dpMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells += `<span class="d${ds===entryDate?' on':''}${ds===today()?' today':''}" data-d="${ds}">${d}</span>`;
  }
  document.getElementById('dpGrid').innerHTML = cells;
}
document.getElementById('dpPrev').onclick=()=>{ if(--dpMonth<0){dpMonth=11;dpYear--;} renderDateGrid(); };
document.getElementById('dpNext').onclick=()=>{ if(++dpMonth>11){dpMonth=0;dpYear++;} renderDateGrid(); };
document.getElementById('dpToday').onclick=()=>{ entryDate=today(); updateDateBtn(); dpick.classList.remove('show'); };
dpick.onclick=e=>{
  if(e.target===dpick){ dpick.classList.remove('show'); return; }
  const cell=e.target.closest('[data-d]');
  if(cell){ entryDate=cell.dataset.d; updateDateBtn(); dpick.classList.remove('show'); }
};

function commitEntry(){
  const val = Math.round(parseFloat(evalAmt())*100)/100;
  if(!val || val<=0){ alert('请输入金额'); return; }
  if(!entryCat){ alert('请选择分类'); return; }
  const note = document.getElementById('noteIn').value.trim();
  if(editingId){
    // 编辑：更新原记录，保留原有的时间部分
    const rec = records.find(r=>r.id===editingId);
    if(rec){
      rec.type=entryType; rec.amount=val; rec.categoryId=entryCat; rec.note=note; rec.currency=entryCur;
      rec.date = entryDate + 'T' + (rec.date.slice(11) || new Date().toTimeString().slice(0,8));
    }
  } else {
    const iso = entryDate + 'T' + new Date().toTimeString().slice(0,8);
    records.push({ id:'r'+Date.now()+Math.random().toString(36).slice(2,6),
      type:entryType, amount:val, categoryId:entryCat, note, currency:entryCur, date:iso, createdAt:Date.now() });
    localStorage.setItem(LS_LASTCUR, entryCur);   // 下次新记账默认沿用
  }
  save();
  // 跳到该笔所在月份
  const [jy,jm] = entryDate.split('-').map(Number);
  viewYear=jy; viewMonth=jm-1;
  renderAll();
  if(!editingId && contMode){          // 连续记账：清空金额/备注，保留分类/日期/币种，弹层不关
    amtStr='0'; document.getElementById('noteIn').value=''; updateAmt();
    showToast('已记一笔 · 继续');
  } else {
    closeSheet();
  }
}
