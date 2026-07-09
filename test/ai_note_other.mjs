/* AI 记账识别 — 备注保留原文 + 不熟悉实体归"其他" 专项评测
 * 用法：node test/ai_note_other.mjs [provider]   (默认 glm，可选 deepseek/kimi/qwen 等)
 * 环境变量：PROVIDER / AI_BASE / AI_MODEL / REPEAT / GAP / RAW / LIMIT
 * 复用 ai_eval.mjs 的基础设施（call / parse / 分项统计） */

import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';

/* 自动加载 .env */
try{
  const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for(const line of txt.split('\n')){
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if(m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g,'');
  }
}catch{}

const CATALOG = {
  glm:        {base:'https://open.bigmodel.cn/api/paas/v4',             keyEnv:'GLM_KEY',        model:'glm-4-flash'},
  deepseek:   {base:'https://api.deepseek.com/v1',                      keyEnv:'DEEPSEEK_KEY',   model:'deepseek-chat'},
  kimi:       {base:'https://api.moonshot.cn/v1',                       keyEnv:'KIMI_KEY',       model:'moonshot-v1-8k'},
  qwen:       {base:'https://dashscope.aliyuncs.com/compatible-mode/v1',keyEnv:'QWEN_KEY',       model:'qwen-turbo'},
  siliconflow:{base:'https://api.siliconflow.cn/v1',                    keyEnv:'SILICONFLOW_KEY',model:'Qwen/Qwen2.5-7B-Instruct'},
  modelscope: {base:'https://api-inference.modelscope.cn/v1',           keyEnv:'MODELSCOPE_KEY', model:'Qwen/Qwen2.5-72B-Instruct'},
  openrouter: {base:'https://openrouter.ai/api/v1',                     keyEnv:'OPENROUTER_KEY', model:''},
  openai:     {base:'https://api.openai.com/v1',                        keyEnv:'OPENAI_KEY',     model:'gpt-4o-mini'},
};
const provider = (process.env.PROVIDER || process.argv[2] || 'glm').toLowerCase();
const cfg = CATALOG[provider];
if(!cfg){ console.error(`未知来源：${provider}\n可选：${Object.keys(CATALOG).join(' / ')}`); process.exit(1); }
const KEY    = process.env[cfg.keyEnv] || process.env.AI_KEY;
const BASE   = process.env.AI_BASE  || cfg.base;
const MODEL  = process.env.AI_MODEL || cfg.model;
const REPEAT = +(process.env.REPEAT || 3);
const LIMIT  = +(process.env.LIMIT || 0);
const RAW    = !!process.env.RAW;
const GAP    = +(process.env.GAP || 120);
if(!KEY){ console.error(`请在 .env 设置 ${cfg.keyEnv}=你的key（来源 ${provider}）`); process.exit(1); }
if(!MODEL){ console.error(`来源 ${provider} 没有内置默认模型，请用 AI_MODEL=xxx 指定`); process.exit(1); }

/* prompt 使用与 app 一致的版本（含备注保留 + 未知归其他） */
const EXPENSE = ['餐饮','交通','购物','居家','娱乐','医疗','学习','其他','零食','通讯','运动','住房','生鲜','数码','旅行','服饰','缴费'];
const INCOME  = ['工资','奖金','理财','其他'];

const SYS = `你是记账助手。把用户的一句话解析成一笔账，只输出一行，用 <> 分隔 4 个字段，顺序固定：
type<>amount<>category<>note
不要输出字段名、引号、JSON、代码块或任何多余文字。不要输出日期。
- type：支出填「支」，收入填「收」。买东西/消费/付钱都是支出
- amount：照抄用户句子里出现的金额数字，必须是纯数字（如 8.5、128），不要带中文单位（不要写成「8块」「8元」「8块钱」）、不要改写、不要计算（下面示例里的数字只是格式示意，绝不要照搬）
- category：必须严格从下面对应类型的列表里原样照抄一个，禁止自造或改字；如果遇到不熟悉的实体（如特定网站、App、服务名等），不确定该归哪类时，一律选「其他」，绝不猜测
- note：从用户原话里提取具体事由/物品作为备注，保留用户原话中的完整表述，一字不差（如用户说「乘坐地铁4」，备注就是「乘坐地铁4」，不要缩成「地铁」；用户说「鲜虾云吞面20」，备注就是「鲜虾云吞面」，不要缩成「云吞面」）。去除金额数字和纯语气词即可，不要自行缩减或改写
可用「支出」分类：${EXPENSE.join('、')}。
可用「收入」分类：${INCOME.join('、')}。
格式示例（数字仅示意）：支<>金额数字<>分类<>备注`;

/* ====== 专项测试用例 ====== */

// A 组：备注保留原文 — 验证 note 不会被缩写成简短关键词
const NOTE_CASES = [
  {in:'乘坐地铁4花了8块',           t:'e', a:8,    cat:'交通', note:'乘坐地铁4'},
  {in:'鲜虾云吞面20',              t:'e', a:20,   cat:'餐饮', note:'鲜虾云吞面'},
  {in:'鲜虾蟹籽云吞面25',           t:'e', a:25,   cat:'餐饮', note:'鲜虾蟹籽云吞面'},
  {in:'和朋友一起打车去公司35',      t:'e', a:35,   cat:'交通', note:'和朋友一起打车去公司'},
  {in:'今天中午吃了碗红烧牛肉面28',    t:'e', a:28,   cat:'餐饮', note:'今天中午吃了碗红烧牛肉面'},
  {in:'昨天晚饭兰州拉面加蛋22',       t:'e', a:22,   cat:'餐饮', note:'昨天晚饭兰州拉面加蛋'},
  {in:'充了半年迅雷会员88',          t:'e', a:88,   cat:'其他', note:'充了半年迅雷会员'},
  {in:'买了两箱农夫山泉矿泉水36',     t:'e', a:36,   cat:['购物','生鲜'], note:'买了两箱农夫山泉矿泉水'},
  {in:'用券后实付9.9买了杯瑞幸',      t:'e', a:9.9,  cat:'餐饮', note:'用券后实付买了杯瑞幸'},
];

// B 组：不熟悉实体归"其他" — 验证不会错分到已有类别
const OTHER_CASES = [
  {in:'autodl充值50',             t:'e', a:50,   cat:'其他'},
  {in:'aws云计算扣费123',           t:'e', a:123,  cat:'其他'},
  {in:'github copilot续费68',      t:'e', a:68,   cat:'其他'},
  {in:'notion会员续费72',           t:'e', a:72,   cat:'其他'},
  {in:'腾讯云轻量服务器续费108',      t:'e', a:108,  cat:'其他'},
  {in:'阿里云cdn费用30',            t:'e', a:30,   cat:'其他'},
  {in:'midjourney订阅200',         t:'e', a:200,  cat:'其他'},
  {in:'chatgpt plus订阅145',       t:'e', a:145,  cat:'其他'},
  {in:'vercel团队版续费120',        t:'e', a:120,  cat:'其他'},
  {in:'yuque语雀会员99',            t:'e', a:99,   cat:'其他'},
  {in:'b站大会员续费168',           t:'e', a:168,  cat:'娱乐'},
  {in:'爱奇艺年费218',             t:'e', a:218,  cat:'娱乐'},
];

const CASES = [...NOTE_CASES, ...OTHER_CASES];

/* ====== 复用 ai_eval 同款调用/解析/统计逻辑 ====== */
const ALL_CATS = [...EXPENSE, ...INCOME];
function validRaw(content){
  const g = parse(content);
  return Number(g.amount)>0 && isFinite(Number(g.amount)) && ALL_CATS.includes(g.category);
}
async function once(messages, temperature){
  const ctrl = new AbortController();
  const tid = setTimeout(()=>ctrl.abort(), 10000);
  try{
    const res = await fetch(BASE.replace(/\/+$/,'')+'/chat/completions', {
      method:'POST', signal:ctrl.signal,
      headers:{ 'content-type':'application/json', 'authorization':'Bearer '+KEY },
      body: JSON.stringify({ model:MODEL, temperature, max_tokens:256, messages })
    });
    if(!res.ok) throw new Error('['+res.status+'] '+await res.text());
    const data = await res.json();
    const msg = data?.choices?.[0]?.message || {};
    return msg.content || msg.reasoning_content || '';
  }catch(e){ if(e.name==='AbortError') throw new Error('请求超时(10s)'); throw e; }
  finally{ clearTimeout(tid); }
}
async function call(input){
  const messages=[{role:'system',content:SYS},{role:'user',content:input}];
  let last='';
  for(let i=0;i<3;i++){
    last = await once(messages, i===0?0:0.7);
    if(validRaw(last)) return last;
  }
  return last;
}
function parse(t){
  const line = (t.split('\n').find(l=>l.includes('<>')) || t).trim();
  const p = line.split('<>').map(s=>s.trim());
  const income = ['收','收入','i','income'].includes(p[0]);
  return { type: income?'i':'e', amount:p[1], category:p[2], note:p[3]||'' };
}
const okCat = (got, exp)=> (Array.isArray(exp)?exp:[exp]).includes(got);

/* note 宽松匹配：去掉空格+常见语气词后，预期 note 的每个字都出现在实际 note 里（允许模型额外多写） */
function noteContains(gotNote, expNote){
  const clean = s=>s.replace(/[的了呢啦啊呀吧吗哦嗯]/g,'').replace(/\s/g,'');
  const got = clean(gotNote);
  const exp = clean(expNote);
  return got.includes(exp);
}

const sleep = ms=>new Promise(r=>setTimeout(r,ms));

(async ()=>{
  console.log(`🗂️  备注原文保留 + 未知归其他 专项评测`);
  console.log(`来源 ${provider}　模型 ${MODEL} @ ${BASE}`);
  console.log(`用例 ${CASES.length} 条 × ${REPEAT} 遍（A组备注保留 ${NOTE_CASES.length} + B组未知归其他 ${OTHER_CASES.length}）\n`);

  let tT=0,tA=0,tC=0,tAll=0,tN=0, err=0, nOk=0;
  const lat=[];
  const wall0 = Date.now();
  const total = LIMIT>0 ? Math.min(LIMIT, CASES.length) : CASES.length;
  for(let i=0;i<total;i++){
    const c=CASES[i]; const marks=[]; const caseLat=[];
    for(let r=0;r<REPEAT;r++){
      tN++;
      const t0 = Date.now();
      try{
        const raw = await call(c.in);
        const ms = Date.now()-t0; lat.push(ms); caseLat.push(ms);
        if(RAW) console.log(`    [${c.in}] 原始返回: ${JSON.stringify(raw)}`);
        const g = parse(raw);
        const okT = g.type===c.t;
        const okA = Number(g.amount)===c.a;
        const okC = okCat(g.category, c.cat);
        const okN = !c.note || noteContains(g.note, c.note);
        if(okT)tT++; if(okA)tA++; if(okC)tC++; if(okN)nOk++;
        if(okT&&okA&&okC&&okN)tAll++;
        const flags = [];
        if(!okT) flags.push(`T:${g.type}`);
        if(!okA) flags.push(`A:${g.amount}`);
        if(!okC) flags.push(`C:${g.category}`);
        if(!okN) flags.push(`N:"${g.note}"`);
        marks.push((okT&&okA&&okC&&okN)?'✓':`✗(${flags.join('|')})`);
      }catch(e){ err++; marks.push('ERR:'+e.message.slice(0,40)); }
      await sleep(GAP);
    }
    const expC = Array.isArray(c.cat)?c.cat.join('/'):c.cat;
    const avgC = caseLat.length ? Math.round(caseLat.reduce((a,b)=>a+b,0)/caseLat.length) : 0;
    console.log(`${String(i+1).padStart(2)}. ${c.in.padEnd(24)} 期望[${c.t}|${c.a}|${expC}${c.note?'|"'+c.note+'"':''}]  ${marks.join('  ')}  ~${avgC}ms`);
  }
  const wall = Date.now()-wall0;
  const pct=n=>(n/tN*100).toFixed(1)+'%';
  console.log(`\n==== 准确率（共 ${tN} 次调用，错误 ${err} 次）====`);
  console.log(`type 命中:      ${tT}/${tN}  ${pct(tT)}`);
  console.log(`amount 命中:    ${tA}/${tN}  ${pct(tA)}`);
  console.log(`category 命中:  ${tC}/${tN}  ${pct(tC)}`);
  console.log(`note 命中:      ${nOk}/${tN}  ${pct(nOk)}`);
  console.log(`四项全对:       ${tAll}/${tN}  ${pct(tAll)}`);
  if(lat.length){
    const sorted=[...lat].sort((a,b)=>a-b);
    const sum=lat.reduce((a,b)=>a+b,0);
    const avg=Math.round(sum/lat.length);
    const p=q=>sorted[Math.min(sorted.length-1, Math.floor(q*sorted.length))];
    console.log(`\n==== 耗时（${lat.length} 次成功调用）====`);
    console.log(`平均:  ${avg}ms  最快/最慢: ${sorted[0]}ms / ${sorted[sorted.length-1]}ms  中位/P90:  ${p(0.5)}ms / ${p(0.9)}ms`);
    console.log(`总墙钟: ${(wall/1000).toFixed(1)}s（含每次 ${GAP}ms 间隔）`);
  }
})();
