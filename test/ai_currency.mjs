/* AI 记账识别 - 币种专项评测（10 条）
 * 用法：node test/ai_currency.mjs [provider]
 * 可选环境变量：PROVIDER / AI_BASE / AI_MODEL / REPEAT / GAP / RAW
 * 默认从项目根目录 .env 读取对应提供方的 key。 */
import { readFileSync } from 'node:fs';

try{
  const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for(const line of txt.split('\n')){
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if(m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g,'');
  }
}catch{}

const CATALOG = {
  glm:        {base:'https://open.bigmodel.cn/api/paas/v4',              keyEnv:'GLM_KEY',         model:'glm-4-flash'},
  deepseek:   {base:'https://api.deepseek.com/v1',                       keyEnv:'DEEPSEEK_KEY',    model:'deepseek-chat'},
  kimi:       {base:'https://api.moonshot.cn/v1',                        keyEnv:'KIMI_KEY',        model:'moonshot-v1-8k'},
  qwen:       {base:'https://dashscope.aliyuncs.com/compatible-mode/v1', keyEnv:'QWEN_KEY',        model:'qwen-turbo'},
  siliconflow:{base:'https://api.siliconflow.cn/v1',                     keyEnv:'SILICONFLOW_KEY', model:'Qwen/Qwen2.5-7B-Instruct'},
  modelscope: {base:'https://api-inference.modelscope.cn/v1',            keyEnv:'MODELSCOPE_KEY',  model:'Qwen/Qwen2.5-72B-Instruct'},
  openrouter: {base:'https://openrouter.ai/api/v1',                      keyEnv:'OPENROUTER_KEY',  model:''},
  openai:     {base:'https://api.openai.com/v1',                         keyEnv:'OPENAI_KEY',      model:'gpt-4o-mini'},
};

const provider = (process.env.PROVIDER || process.argv[2] || 'glm').toLowerCase();
const cfg = CATALOG[provider];
if(!cfg){
  console.error(`未知来源：${provider}\n可选：${Object.keys(CATALOG).join(' / ')}`);
  process.exit(1);
}
const KEY = process.env[cfg.keyEnv] || process.env.AI_KEY;
const BASE = process.env.AI_BASE || cfg.base;
const MODEL = process.env.AI_MODEL || cfg.model;
const REPEAT = +(process.env.REPEAT || 1);
const GAP = +(process.env.GAP || 120);
const RAW = !!process.env.RAW;
if(!KEY){
  console.error(`请在 .env 设置 ${cfg.keyEnv}=你的key（来源 ${provider}）`);
  process.exit(1);
}
if(!MODEL){
  console.error(`来源 ${provider} 没有默认模型，请用 AI_MODEL=xxx 指定`);
  process.exit(1);
}

const EXPENSE = ['餐饮','交通','购物','居家','娱乐','医疗','学习','其他','零食','通讯','运动','住房','生鲜','数码','旅行','服饰','缴费'];
const INCOME = ['工资','奖金','理财','其他'];
const CURRENCIES = [
  'CNY=人民币','USD=美元','EUR=欧元','GBP=英镑','JPY=日元','HKD=港币',
  'TWD=新台币','KRW=韩元','SGD=新加坡元','AUD=澳元','CAD=加元',
  'THB=泰铢','MYR=林吉特','RUB=卢布'
];

const SYS = `你是记账助手。把用户的话解析成账目。一句话可能含多笔，每笔输出一行，用 <> 分隔 5 个字段：
type<>amount<>currency<>category<>note
不要输出字段名、引号、JSON、代码块、日期或多余文字。
- type：支出填「支」，收入填「收」
- amount：只填原话中的金额数字
- currency：只有用户明确说出币种时才填小写 ISO 代码；没说必须留空，禁止猜测；前一笔明确币种可沿用到后续未重复说明的账目
- category：必须从对应分类列表中原样选择
- note：保留用途，去掉金额
可用币种：${CURRENCIES.join('、')}。
支出分类：${EXPENSE.join('、')}。
收入分类：${INCOME.join('、')}。
示例：支<>80<>hkd<>餐饮<>午饭`;

/* 每个 out 元素依次为：类型、金额、币种；null 表示必须留空。 */
const CASES = [
  {in:'港币42买早餐',                    out:[['e',42,'hkd']]},
  {in:'打车花了15美元',                  out:[['e',15,'usd']]},
  {in:'买纪念品30欧元',                  out:[['e',30,'eur']]},
  {in:'酒店住宿付了680泰铢',              out:[['e',680,'thb']]},
  {in:'地铁票240日元',                   out:[['e',240,'jpy']]},
  {in:'咖啡8新加坡元',                   out:[['e',8,'sgd']]},
  {in:'买衣服90澳元',                    out:[['e',90,'aud']]},
  {in:'收到工资5000港元',                 out:[['i',5000,'hkd']]},
  {in:'午饭花了25',                      out:[['e',25,null]]},
  {in:'港币80吃饭，20打车，美元10买水',
    out:[['e',80,'hkd'],['e',20,'hkd'],['e',10,'usd']]},
];

function parseLines(text){
  return text.split('\n').map(line=>line.trim()).filter(line=>line.includes('<>')).map(line=>{
    const p = line.split('<>').map(s=>s.trim());
    return {
      type:['收','收入','i','income'].includes(p[0]) ? 'i' : 'e',
      amount:Number(p[1]),
      currency:(p[2] || '').toLowerCase() || null,
    };
  });
}

function matches(actual, expected){
  return actual.length===expected.length && expected.every((row, i)=>
    actual[i].type===row[0] &&
    actual[i].amount===row[1] &&
    actual[i].currency===row[2]
  );
}

async function request(input){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), 10000);
  try{
    const res = await fetch(BASE.replace(/\/+$/,'')+'/chat/completions', {
      method:'POST',
      signal:ctrl.signal,
      headers:{'content-type':'application/json','authorization':'Bearer '+KEY},
      body:JSON.stringify({
        model:MODEL,
        temperature:0,
        max_tokens:512,
        messages:[{role:'system',content:SYS},{role:'user',content:input}]
      })
    });
    if(!res.ok) throw new Error(`[${res.status}] ${await res.text()}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }catch(err){
    if(err.name==='AbortError') throw new Error('请求超时（10s）');
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

const sleep = ms=>new Promise(resolve=>setTimeout(resolve, ms));

let passed=0, total=0, errors=0;
console.log(`币种识别专项评测：${provider} / ${MODEL} / ${CASES.length} 条 x ${REPEAT} 遍\n`);
for(let i=0; i<CASES.length; i++){
  const testCase = CASES[i];
  const results = [];
  for(let repeat=0; repeat<REPEAT; repeat++){
    total++;
    try{
      const raw = await request(testCase.in);
      if(RAW) console.log(`  原始返回：${JSON.stringify(raw)}`);
      const actual = parseLines(raw);
      const ok = matches(actual, testCase.out);
      if(ok) passed++;
      results.push(ok ? '通过' : `失败 ${JSON.stringify(actual)}`);
    }catch(err){
      errors++;
      results.push(`错误 ${err.message.slice(0,80)}`);
    }
    await sleep(GAP);
  }
  console.log(`${String(i+1).padStart(2)}. ${testCase.in} -> ${results.join('；')}`);
}

console.log(`\n结果：${passed}/${total} 通过，${errors} 次请求错误，准确率 ${(passed/total*100).toFixed(1)}%`);
if(passed!==total) process.exitCode=1;
