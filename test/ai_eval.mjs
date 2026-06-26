/* AI 记账识别 评测脚本
 * 用法：① 在 .env 里按来源填 key（GLM_KEY / DEEPSEEK_KEY / ...）
 *      ② 选来源跑：node test/ai_eval.mjs deepseek   或   PROVIDER=deepseek node test/ai_eval.mjs
 *      ③ 默认来源 glm；可用 AI_BASE / AI_MODEL 覆盖，REPEAT 控制重复次数
 * 对 50 条样例各重复 REPEAT 遍，校验 type / amount / category 命中率与耗时。 */
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';

/* 自动加载项目根目录的 .env（KEY=VALUE，只填充尚未设置的变量） */
try{
  const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for(const line of txt.split('\n')){
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if(m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g,'');
  }
}catch{ /* 没有 .env 就用环境变量 */ }

/* 各来源：base + 对应的 key 环境变量名 + 默认模型 */
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
const KEY    = process.env[cfg.keyEnv] || process.env.AI_KEY;   // 兼容旧的 AI_KEY
const BASE   = process.env.AI_BASE  || cfg.base;
const MODEL  = process.env.AI_MODEL || cfg.model;
const REPEAT = +(process.env.REPEAT || 3);
const LIMIT  = +(process.env.LIMIT || 0);   // 只跑前 N 条（0=全部），便于快速诊断
const RAW    = !!process.env.RAW;            // 打印模型原始返回
const GAP    = +(process.env.GAP || 120);   // 每次调用间隔(ms)，免费限流严的来源调大如 2500
if(!KEY){ console.error(`请在 .env 设置 ${cfg.keyEnv}=你的key（来源 ${provider}）`); process.exit(1); }
if(!MODEL){ console.error(`来源 ${provider} 没有内置默认模型，请用 AI_MODEL=xxx 指定`); process.exit(1); }

const EXPENSE = ['餐饮','交通','购物','居家','娱乐','医疗','学习','其他','零食','通讯','运动','住房','生鲜','数码','旅行','服饰','缴费'];
const INCOME  = ['工资','奖金','理财','其他'];

const SYS = `你是记账助手。把用户的一句话解析成一笔账，只输出一行，用 <> 分隔 4 个字段，顺序固定：
type<>amount<>category<>note
不要输出字段名、引号、JSON、代码块或任何多余文字。不要输出日期。
- type：支出填「支」，收入填「收」。买东西/消费/付钱都是支出
- amount：照抄用户句子里出现的金额数字，一位不差，不要改写、不要计算（下面示例里的数字只是格式示意，绝不要照搬）
- category：必须从下面对应类型的列表里原样照抄一个，禁止自造或改字
- note：简短备注，没有就留空
可用「支出」分类：${EXPENSE.join('、')}。
可用「收入」分类：${INCOME.join('、')}。
格式示例（数字仅示意）：支<>金额数字<>分类<>备注`;

/* cat 可为字符串或数组（多个可接受答案） */
const CASES = [
  {in:'中午吃面花了18',        t:'e', a:18,   cat:'餐饮'},
  {in:'晚上和朋友吃火锅128',    t:'e', a:128,  cat:'餐饮'},
  {in:'早餐豆浆油条6.5',        t:'e', a:6.5,  cat:'餐饮'},
  {in:'买了杯星巴克33',         t:'e', a:33,   cat:['餐饮','零食']},
  {in:'打车回家28.5',          t:'e', a:28.5, cat:'交通'},
  {in:'地铁通勤7块',           t:'e', a:7,    cat:'交通'},
  {in:'给车加油300',           t:'e', a:300,  cat:'交通'},
  {in:'高铁票156',             t:'e', a:156,  cat:['交通','旅行']},
  {in:'网购一件外套259',        t:'e', a:259,  cat:['购物','服饰']},
  {in:'买了双运动鞋399',        t:'e', a:399,  cat:['服饰','运动','购物']},
  {in:'超市买菜76.3',          t:'e', a:76.3, cat:['生鲜','购物']},
  {in:'买水果一袋25',          t:'e', a:25,   cat:['生鲜','零食','餐饮']},
  {in:'买零食薯片12',          t:'e', a:12,   cat:'零食'},
  {in:'充话费50',             t:'e', a:50,   cat:'通讯'},
  {in:'宽带续费780',           t:'e', a:780,  cat:['通讯','缴费']},
  {in:'看电影45',             t:'e', a:45,   cat:'娱乐'},
  {in:'游戏充值68',            t:'e', a:68,   cat:'娱乐'},
  {in:'健身房月卡299',         t:'e', a:299,  cat:'运动'},
  {in:'买了个篮球120',         t:'e', a:120,  cat:['运动','购物']},
  {in:'看病挂号50',           t:'e', a:50,   cat:'医疗'},
  {in:'买感冒药38',           t:'e', a:38,   cat:'医疗'},
  {in:'买书三本97',           t:'e', a:97,   cat:['学习','购物']},
  {in:'报了个网课199',         t:'e', a:199,  cat:'学习'},
  {in:'交房租3500',           t:'e', a:3500, cat:'住房'},
  {in:'物业费260',            t:'e', a:260,  cat:['缴费','住房']},
  {in:'交水电费128',          t:'e', a:128,  cat:'缴费'},
  {in:'买了个机械键盘259',      t:'e', a:259,  cat:['数码','购物']},
  {in:'换手机屏幕480',         t:'e', a:480,  cat:'数码'},
  {in:'订机票1280',           t:'e', a:1280, cat:'旅行'},
  {in:'酒店住宿一晚420',       t:'e', a:420,  cat:'旅行'},
  {in:'买衣服两件340',         t:'e', a:340,  cat:'服饰'},
  {in:'理发55',              t:'e', a:55,   cat:['其他','服饰']},
  {in:'给妈妈买礼物280',       t:'e', a:280,  cat:['购物','其他']},
  {in:'买猫粮150',            t:'e', a:150,  cat:['其他','购物','生鲜']},
  {in:'停车费15',            t:'e', a:15,   cat:'交通'},
  {in:'买了个台灯89',         t:'e', a:89,   cat:['居家','购物']},
  {in:'买洗衣液29.9',         t:'e', a:29.9, cat:['居家','购物','生鲜']},
  {in:'朋友聚餐我出95',        t:'e', a:95,   cat:'餐饮'},
  {in:'奶茶一杯16',           t:'e', a:16,   cat:['餐饮','零食']},
  {in:'买了一张电影票90',       t:'e', a:90,   cat:'娱乐'},
  {in:'打疫苗280',            t:'e', a:280,  cat:'医疗'},
  {in:'买了件衬衫159',         t:'e', a:159,  cat:'服饰'},
  {in:'共享单车1.5',          t:'e', a:1.5,  cat:'交通'},
  {in:'买午饭快餐23',          t:'e', a:23,   cat:'餐饮'},
  {in:'发工资8000',           t:'i', a:8000, cat:'工资'},
  {in:'收到年终奖15000',       t:'i', a:15000,cat:'奖金'},
  {in:'基金分红320',          t:'i', a:320,  cat:'理财'},
  {in:'收到红包200',          t:'i', a:200,  cat:['奖金','其他']},
  {in:'兼职收入500',          t:'i', a:500,  cat:['工资','其他']},
  {in:'银行利息88',           t:'i', a:88,   cat:'理财'},
];

const ALL_CATS = [...EXPENSE, ...INCOME];
function validRaw(content){
  const g = parse(content);
  return Number(g.amount)>0 && isFinite(Number(g.amount)) && ALL_CATS.includes(g.category);
}
/* 单次请求：10s 超时 */
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
    return msg.content || msg.reasoning_content || '';   // 兼容把答案放 reasoning 的模型
  }catch(e){ if(e.name==='AbortError') throw new Error('请求超时(10s)'); throw e; }
  finally{ clearTimeout(tid); }
}
/* 解析校验不过就重试，最多 3 次（与 app 一致） */
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
  const income = ['收','收入','i','income'].includes(p[0]);   // 归一成 e/i 便于打分
  return { type: income?'i':'e', amount:p[1], category:p[2], note:p[3]||'' };
}
const okCat = (got, exp)=> (Array.isArray(exp)?exp:[exp]).includes(got);

const sleep = ms=>new Promise(r=>setTimeout(r,ms));

(async ()=>{
  console.log(`来源 ${provider}　模型 ${MODEL} @ ${BASE}　样例 ${CASES.length} × ${REPEAT} 遍\n`);
  let tT=0,tA=0,tC=0,tAll=0,tN=0, err=0;
  const lat=[];                       // 每次成功调用的延迟(ms)
  const wall0 = Date.now();           // 总墙钟开始
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
        if(okT)tT++; if(okA)tA++; if(okC)tC++; if(okT&&okA&&okC)tAll++;
        marks.push((okT&&okA&&okC)?'✓':`✗(${g.type}|${g.amount}|${g.category})`);
      }catch(e){ err++; marks.push('ERR:'+e.message.slice(0,40)); }
      await sleep(GAP);
    }
    const expC = Array.isArray(c.cat)?c.cat.join('/'):c.cat;
    const avgC = caseLat.length ? Math.round(caseLat.reduce((a,b)=>a+b,0)/caseLat.length) : 0;
    console.log(`${String(i+1).padStart(2)}. ${c.in.padEnd(16)} 期望[${c.t}|${c.a}|${expC}]  ${marks.join('  ')}  ~${avgC}ms`);
  }
  const wall = Date.now()-wall0;
  const pct=n=>(n/tN*100).toFixed(1)+'%';
  console.log(`\n==== 准确率（共 ${tN} 次调用，错误 ${err} 次）====`);
  console.log(`type 命中:    ${tT}/${tN}  ${pct(tT)}`);
  console.log(`amount 命中:  ${tA}/${tN}  ${pct(tA)}`);
  console.log(`category 命中:${tC}/${tN}  ${pct(tC)}`);
  console.log(`三项全对:     ${tAll}/${tN}  ${pct(tAll)}`);
  if(lat.length){
    const sorted=[...lat].sort((a,b)=>a-b);
    const sum=lat.reduce((a,b)=>a+b,0);
    const avg=Math.round(sum/lat.length);
    const p=q=>sorted[Math.min(sorted.length-1, Math.floor(q*sorted.length))];
    console.log(`\n==== 耗时（${lat.length} 次成功调用）====`);
    console.log(`平均:  ${avg}ms`);
    console.log(`最快/最慢: ${sorted[0]}ms / ${sorted[sorted.length-1]}ms`);
    console.log(`中位/P90:  ${p(0.5)}ms / ${p(0.9)}ms`);
    console.log(`总墙钟:    ${(wall/1000).toFixed(1)}s（含每次 120ms 间隔）`);
    // 追加一行汇总到记录文件（只记完整跑，避免 LIMIT 快测污染）
    if(LIMIT>0){ console.log('\n(LIMIT 快测，不写入 results.md)'); return; }
    const rp = new URL('./results.md', import.meta.url);
    if(!existsSync(rp)) writeFileSync(rp,
      '# AI 记账识别测评记录（50 样例 × 3 遍）\n\n'+
      '| 时间 | 来源 | 模型 | type | amount | category | 三项全对 | 平均ms | 中位ms | 备注 |\n'+
      '|---|---|---|---|---|---|---|---|---|---|\n');
    const ts = new Date().toISOString().slice(0,16).replace('T',' ');
    appendFileSync(rp, `| ${ts} | ${provider} | ${MODEL} | ${pct(tT)} | ${pct(tA)} | ${pct(tC)} | ${pct(tAll)} | ${avg} | ${p(0.5)} | ${process.env.NOTE||''} |\n`);
    console.log(`\n已追加汇总到 test/results.md`);
  }
})();
