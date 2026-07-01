/* =================== AI 智能记账（OpenAI 兼容接口，多配置）===================
   支持保存多套配置（名称 + base URL + key + 模型），随时切换"使用中"。
   依赖 entry.js 的 setType / highlightCat / updateAmt 等全局。 */
const LS_PROFILES = 'et_aiprofiles', LS_ACTIVE = 'et_aiactive', LS_ACTMODEL = 'et_aimodel';
const DEF_BASE = 'https://api-inference.modelscope.cn/v1', DEF_MODEL = 'Qwen/Qwen3-30B-A3B-Instruct-2507';

/* 每个配置=一个来源：{id,name,base,key,models:[...]}；归一化旧数据(单 model→models) */
function normProfile(p){
  if(!Array.isArray(p.models)) p.models = p.model ? [p.model] : [DEF_MODEL];
  if(!p.models.length) p.models = [DEF_MODEL];
  delete p.model;
  return p;
}
function loadProfiles(){
  let p = null;
  try{ p = JSON.parse(localStorage.getItem(LS_PROFILES)); }catch(e){}
  if(!Array.isArray(p) || !p.length){
    p = [{ id:'p'+Date.now(), name:'默认',
           base: localStorage.getItem('et_baseurl') || DEF_BASE,
           key:  localStorage.getItem('et_apikey')  || '',
           models:[ localStorage.getItem('et_model') || DEF_MODEL ] }];
  }
  return p.map(normProfile);
}
let aiProfiles = loadProfiles();
let aiActiveId = localStorage.getItem(LS_ACTIVE) || aiProfiles[0].id;
if(!aiProfiles.some(p=>p.id===aiActiveId)) aiActiveId = aiProfiles[0].id;
let aiActiveModel = localStorage.getItem(LS_ACTMODEL) || '';

function activeProfile(){ return aiProfiles.find(p=>p.id===aiActiveId) || aiProfiles[0]; }
function curModels(){ return activeProfile().models; }
function saveProfiles(){ localStorage.setItem(LS_PROFILES, JSON.stringify(aiProfiles));
                         localStorage.setItem(LS_ACTIVE, aiActiveId);
                         localStorage.setItem(LS_ACTMODEL, aiActiveModel); }
const getKey   = ()=> activeProfile().key || '';
const getBase  = ()=> (activeProfile().base || DEF_BASE).replace(/\/+$/,'');
const getModel = ()=> curModels().includes(aiActiveModel) ? aiActiveModel : (curModels()[0] || DEF_MODEL);

/* ---- 设置页：配置列表（点行=切换使用，点编辑=改/删，＋添加） ---- */
function renderAiProfiles(){
  const box = document.getElementById('aiProfileList');
  box.innerHTML = aiProfiles.map(p=>{
    const on = p.id===aiActiveId;
    const chips = on ? `<div class="ap-models">${
      p.models.map(m=>`<span class="apm${m===getModel()?' on':''}" data-model="${esc(m)}">${esc(m)}</span>`).join('')
    }</div>` : '';
    return `<div class="ai-prof${on?' on':''}" data-prof="${p.id}">
      <div class="ap-main">
        <div class="ap-name">${esc(p.name||'未命名')}${on?' <span class="ap-cur">使用中</span>':''}</div>
        <div class="ap-sub">${esc((p.base||'').replace(/^https?:\/\//,''))} · ${p.models.length} 个模型 · ${p.key?'已配置 key':'无 key'}</div>
      </div>
      <div class="ap-edit" data-editprof="${p.id}">编辑</div>
    </div>${chips}`;
  }).join('') + `<div class="ai-prof add" data-addprof>＋ 添加配置</div>`;
}
document.getElementById('aiProfileList').addEventListener('click', e=>{
  if(e.target.closest('[data-addprof]')) return openAiModal({mode:'add'});
  const ed = e.target.closest('[data-editprof]');
  if(ed) return openAiModal({mode:'edit', id:ed.dataset.editprof});
  const mc = e.target.closest('[data-model]');
  if(mc){ aiActiveModel = mc.dataset.model; saveProfiles(); renderAiProfiles(); return; }
  const row = e.target.closest('[data-prof]');
  if(row){ aiActiveId = row.dataset.prof; aiActiveModel = curModels()[0]; saveProfiles(); renderAiProfiles(); }
});

/* ---- 新增/编辑配置弹窗：来源下拉自动填 base，没有则选「自定义」手填 ---- */
const PROVIDERS = [
  {name:'魔搭ModelScope',base:'https://api-inference.modelscope.cn/v1',     models:['Qwen/Qwen3-30B-A3B-Instruct-2507']},
  {name:'智谱 GLM',  base:'https://open.bigmodel.cn/api/paas/v4',            models:['glm-4-flash','glm-4']},
  {name:'DeepSeek', base:'https://api.deepseek.com/v1',                     models:['deepseek-chat','deepseek-reasoner']},
  {name:'Kimi',     base:'https://api.moonshot.cn/v1',                      models:['moonshot-v1-8k']},
  {name:'通义千问',  base:'https://dashscope.aliyuncs.com/compatible-mode/v1',models:['qwen-turbo','qwen-plus']},
  {name:'硅基流动',  base:'https://api.siliconflow.cn/v1',                   models:['Qwen/Qwen2.5-7B-Instruct']},
  {name:'OpenRouter',base:'https://openrouter.ai/api/v1',                   models:[]},
  {name:'OpenAI',   base:'https://api.openai.com/v1',                       models:['gpt-4o-mini']},
];
const normBase = u => (u||'').trim().replace(/\/+$/,'');
function nameForBase(base){
  const k = PROVIDERS.find(p=>normBase(p.base)===normBase(base));
  return k ? k.name : (base.replace(/^https?:\/\//,'').split('/')[0] || '自定义');
}

const aiModal = document.getElementById('aiModal');
let amCtx = null, amProvider = '', amModelEdit = [];

function renderProviderChips(){
  document.getElementById('amProviders').innerHTML =
    [...PROVIDERS.map(p=>p.name), '自定义'].map(n=>
      `<span class="prov${n===amProvider?' on':''}" data-pname="${esc(n)}">${esc(n)}</span>`).join('');
}
document.getElementById('amProviders').addEventListener('click', e=>{
  const c = e.target.closest('[data-pname]'); if(!c) return;
  amProvider = c.dataset.pname;
  const prov = PROVIDERS.find(p=>p.name===amProvider);
  // 点哪个来源，就把接口地址和推荐模型都换成该来源的（自定义则清空让用户手填）
  document.getElementById('amBase').value = prov ? prov.base : '';
  document.getElementById('amKey').value = '';   // key 按来源不同，切换时清空重填
  amModelEdit = prov ? [...prov.models] : [];
  renderProviderChips(); renderModelChips();
});

/* 模型：标签式逐个增删 */
function renderModelChips(){
  document.getElementById('amModelChips').innerHTML = amModelEdit.length
    ? amModelEdit.map((m,i)=>`<span class="mchip">${esc(m)}<span class="x" data-mdel="${i}">×</span></span>`).join('')
    : '<span class="mdl-empty">下面输入模型名添加</span>';
}
function addModel(){
  const inp = document.getElementById('amModelIn');
  const m = inp.value.trim();
  if(m && !amModelEdit.includes(m)) amModelEdit.push(m);
  inp.value=''; inp.focus(); renderModelChips();
}
document.getElementById('amModelAdd').onclick = addModel;
document.getElementById('amModelIn').addEventListener('keydown', e=>{
  if(e.key==='Enter'){ e.preventDefault(); addModel(); }
});
document.getElementById('amModelChips').addEventListener('click', e=>{
  const x = e.target.closest('[data-mdel]'); if(!x) return;
  amModelEdit.splice(+x.dataset.mdel, 1); renderModelChips();
});

function openAiModal(ctx){
  amCtx = ctx;
  const p = ctx.mode==='edit' ? aiProfiles.find(x=>x.id===ctx.id) : null;
  document.getElementById('amTitle').textContent = p ? '编辑配置' : '新增配置';
  if(p){
    document.getElementById('amBase').value = p.base;
    document.getElementById('amKey').value  = p.key;
    amModelEdit = [...p.models];
    const known = PROVIDERS.find(pr=>normBase(pr.base)===normBase(p.base));
    amProvider = known ? known.name : '自定义';
  } else {
    const z = PROVIDERS[0];                                       // 新增默认选第一个来源
    amProvider = z.name;
    document.getElementById('amBase').value = z.base;
    document.getElementById('amKey').value  = '';
    amModelEdit = [...z.models];
  }
  document.getElementById('amModelIn').value = '';
  renderProviderChips(); renderModelChips();
  document.getElementById('amDel').style.display = p ? '' : 'none';
  aiModal.classList.add('show');
}
function closeAiModal(){ aiModal.classList.remove('show'); amCtx = null; }
document.getElementById('amCancel').onclick = closeAiModal;
aiModal.onclick = e=>{ if(e.target===aiModal) closeAiModal(); };
document.getElementById('amSave').onclick = ()=>{
  if(!amCtx) return;
  const v = id=>document.getElementById(id).value.trim();
  const base=v('amBase')||DEF_BASE, key=v('amKey'), name=nameForBase(base);
  let models = amModelEdit.slice();
  if(!models.length) models=[DEF_MODEL];
  if(amCtx.mode==='edit'){
    const p = aiProfiles.find(x=>x.id===amCtx.id);
    if(p){ p.name=name; p.base=base; p.key=key; p.models=models; }
  } else {
    const id='p'+Date.now()+Math.random().toString(36).slice(2,5);
    aiProfiles.push({id, name, base, key, models}); aiActiveId=id;   // 新增即设为使用中
  }
  if(!curModels().includes(aiActiveModel)) aiActiveModel = curModels()[0];
  saveProfiles(); renderAiProfiles(); closeAiModal();
};
document.getElementById('amDel').onclick = ()=>{
  if(!amCtx || amCtx.mode!=='edit') return;
  if(aiProfiles.length<=1){ alert('至少保留一个配置'); return; }
  if(confirm('删除该配置？')){
    aiProfiles = aiProfiles.filter(p=>p.id!==amCtx.id);
    if(!aiProfiles.some(p=>p.id===aiActiveId)) aiActiveId = aiProfiles[0].id;
    saveProfiles(); renderAiProfiles(); closeAiModal();
  }
};

/* ---- 语音/文字输入触发 ---- */
const aiBtn = document.getElementById('aiBtn');
const aiInput = document.getElementById('aiInput');
aiBtn.onclick = runAI;
aiInput.addEventListener('keydown', e=>{ if(e.key==='Enter') runAI(); });

async function runAI(){
  const text = aiInput.value.trim();
  if(!text) return;
  if(!getKey()){ alert('请先到「我的 → AI 智能记账」添加/选择一个带 key 的配置'); return; }
  aiBtn.disabled = true;
  aiBtn.innerHTML = '<span class="spin"></span>';
  try{
    const arr = await callLLM(text);
    saveMultiple(arr);                                 // 单笔/多笔都直接入账，不再填表复核
  }catch(err){
    alert('识别失败：' + (err.message || err));
  }finally{
    aiBtn.disabled = false;
    aiBtn.textContent = '识别';
  }
}

/* 多笔：用当前弹层的日期/币种直接批量记录 */
function saveMultiple(arr){
  const iso = entryDate + 'T' + new Date().toTimeString().slice(0,8);
  let n=0;
  arr.forEach(r=>{
    const amt = Math.round(Number(r.amount)*100)/100;
    if(!(amt>0 && isFinite(amt))) return;
    const type = r.type==='income' ? 'income' : 'expense';
    const cat = findCategory(type, r.category)
             || cats[type].find(c=>c.id===(type==='expense'?'other_e':'other_i')) || cats[type][0];
    records.push({ id:'r'+Date.now()+Math.random().toString(36).slice(2,6),
      type, amount:amt, categoryId:cat.id, note:(r.note||'').slice(0,30),
      currency:entryCur, date:iso, createdAt:Date.now() });
    n++;
  });
  if(!n){ alert('没解析出有效记录'); return; }
  save();
  const [jy,jm] = entryDate.split('-').map(Number); viewYear=jy; viewMonth=jm-1;
  aiInput.value=''; renderAll(); closeSheet();
  showToast(`已记 ${n} 笔`);
}

/* ---- 调用大模型，抽取一笔账（紧凑分隔格式，比 JSON 更快） ----
   只让模型出 4 个字段：type<>amount<>category<>note；日期不进模型输出，由代码处理。 */
async function callLLM(text){
  const sys = `你是记账助手。把用户的话解析成账目。一句话里可能含多笔，每笔输出一行，用 <> 分隔 4 个字段，顺序固定：
type<>amount<>category<>note
只有一笔就一行。不要输出字段名、引号、JSON、代码块或多余文字。不要输出日期。
- type：支出填「支」，收入填「收」。买东西/消费/付钱都是支出
- amount：照抄用户句子里出现的金额数字，一位不差，不要改写、不要计算（下面示例里的数字只是格式示意，绝不要照搬）
- category：必须从下面对应类型的列表里原样照抄一个，禁止自造或改字
- note：从用户话里提取具体事由/物品作为备注（如「地铁」「挂号」「打车」「买菜」「奶茶」「工资」「话费」），要比分类更具体，尽量简短（不超过10字）；只有当除金额和分类外确实没有任何具体信息时才留空
可用「支出」分类：${cats.expense.map(c=>c.name).join('、')}。
可用「收入」分类：${cats.income.map(c=>c.name).join('、')}。
格式示例（数字仅示意，多笔各占一行）：
支<>金额数字<>分类<>备注
支<>金额数字<>分类<>备注`;
  const headers = { 'content-type':'application/json', 'authorization':'Bearer '+getKey() };
  const msgs = [ {role:'system', content:sys}, {role:'user', content:text} ];
  let last = [];
  for(let i=0;i<3;i++){                       // 最多 3 次：解析校验不过就重试
    const data = await postJSON(getBase()+'/chat/completions', headers, {
      model: getModel(), messages: msgs,
      temperature: i===0 ? 0 : 0.7,           // 重试升温
      max_tokens: 512
    });
    const content = data?.choices?.[0]?.message?.content;
    if(content){ const arr = parseLines(content); last = arr;
      const ok = arr.filter(validEntry); if(ok.length) return ok; }
  }
  if(!last.length) throw new Error('没解析出有效记录');
  return last;                                 // 3 次仍不合规：原样返回，applyAIResult 会兜底
}

/* 解析多行 "支/收<>amount<>category<>note"，每行一笔 */
function parseLines(t){
  return t.split('\n').map(l=>l.trim()).filter(l=>l.includes('<>')).map(line=>{
    const p = line.split('<>').map(s=>s.trim());
    const income = ['收','收入','i','income'].includes(p[0]);
    return { type: income?'income':'expense', amount:p[1]||'', category:p[2]||'', note:p[3]||'' };
  });
}

/* 解析校验：金额必须是正数，分类必须能对上某个已有分类 */
function validEntry(r){
  const amt = Number(r.amount);
  return amt>0 && isFinite(amt) && findCategory(r.type, r.category)!=null;
}

/* 解析 "支/收<>amount<>category<>note"（按位置取值，缺省留空；不含日期） */
function parseDelimited(t){
  const line = (t.split('\n').find(l=>l.includes('<>')) || t).trim();
  const p = line.split('<>').map(s=>s.trim());
  const income = ['收','收入','i','income'].includes(p[0]);
  return { type: income ? 'income' : 'expense',
           amount:p[1]||'', category:p[2]||'', note:p[3]||'' };
}

/* 让模型为分类名挑一个 emoji（本地关键词没命中时兜底） */
async function aiPickEmoji(name){
  if(!getKey()) return null;
  try{
    const data = await postJSON(getBase()+'/chat/completions', {
      'content-type':'application/json', 'authorization':'Bearer '+getKey()
    }, {
      model:getModel(), max_tokens:10, temperature:0,
      messages:[
        {role:'system', content:'根据用户给的中文记账分类名，只回复一个最贴切的 emoji，不要任何文字、解释或标点。'},
        {role:'user', content:name}
      ]
    });
    const t = data?.choices?.[0]?.message?.content || '';
    const m = t.match(/\p{Extended_Pictographic}/u);
    return m ? m[0] : null;
  }catch(_){ return null; }
}

/* 发 POST：App 内优先用 CapacitorHttp（绕过 CORS），否则用 fetch；10s 超时 */
async function postJSON(url, headers, bodyObj, timeoutMs=10000){
  const CapHttp = window.CapacitorHttp || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp);
  if(CapHttp){
    const res = await CapHttp.request({ url, method:'POST', headers, data:bodyObj,
      connectTimeout:timeoutMs, readTimeout:timeoutMs });
    if(res.status < 200 || res.status >= 300){
      const d = typeof res.data==='string' ? (()=>{try{return JSON.parse(res.data)}catch(_){return null}})() : res.data;
      throw new Error(`[${res.status}] ` + ((d && (d.error?.message || d.message)) || res.data || ''));
    }
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const ctrl = new AbortController();
  const tid = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(url, { method:'POST', headers, body:JSON.stringify(bodyObj), signal:ctrl.signal });
    if(!res.ok){
      let detail = '';
      try{ const e = await res.json(); detail = e.error?.message || e.message || JSON.stringify(e); }
      catch(_){ try{ detail = await res.text(); }catch(__){} }
      throw new Error(`[${res.status}] ` + detail);
    }
    return await res.json();
  }catch(e){
    if(e.name==='AbortError') throw new Error(`请求超时（${timeoutMs/1000}s）`);
    throw e;
  }finally{ clearTimeout(tid); }
}

/* 把分类名匹配到已有分类：精确 → 包含 → 字符重叠(救"家居↔居家")；没匹配返回 null */
function findCategory(type, name){
  if(!name) return null;
  const list = cats[type];
  let m = list.find(c=>c.name===name)
       || list.find(c=>c.name.includes(name) || name.includes(c.name));
  if(m) return m;
  const set = new Set(name);
  let best=null, bestScore=0;
  for(const c of list){
    const inter = [...new Set(c.name)].filter(ch=>set.has(ch)).length;
    const score = inter / Math.max(c.name.length, name.length);
    if(score>bestScore){ bestScore=score; best=c; }
  }
  return bestScore>=0.5 ? best : null;
}

/* ---- 把解析结果填进手动表单（日期保持弹层当前值，默认今天） ---- */
function applyAIResult(r){
  const type = r.type==='income' ? 'income' : 'expense';
  setType(type);   // 重建分类网格并默认选中第一个
  const match = findCategory(type, r.category)
             || cats[type].find(c=>c.id===(type==='expense'?'other_e':'other_i'))
             || cats[type][0];
  if(match){ entryCat = match.id; highlightCat(); }
  const amt = Math.round(Number(r.amount)*100)/100;
  amtStr = (amt>0 && isFinite(amt)) ? String(amt) : '0';
  updateAmt();
  document.getElementById('noteIn').value = (r.note||'').slice(0,30);
  aiInput.value = '';
}
