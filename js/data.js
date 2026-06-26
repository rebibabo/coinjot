/* =================== 数据层 + 视图状态 + 通用工具 ===================
   全局变量/函数供其它模块共用，本文件最先加载。 */
const LS_REC = 'et_records', LS_CAT = 'et_categories';
const DEFAULT_CATS = {
  expense: [
    {id:'food',   name:'餐饮', icon:'🍜', color:'#ff7a59'},
    {id:'shop',   name:'购物', icon:'🛍️', color:'#ff5a8a'},
    {id:'traffic',name:'交通', icon:'🚌', color:'#4aa3ff'},
    {id:'home',   name:'居家', icon:'🏠', color:'#7c6cff'},
    {id:'fun',    name:'娱乐', icon:'🎮', color:'#ffb020'},
    {id:'health', name:'医疗', icon:'💊', color:'#2ec8a0'},
    {id:'study',  name:'学习', icon:'📚', color:'#16a3b8'},
    {id:'other_e',name:'其他', icon:'💴', color:'#9aa0ad'},
  ],
  income: [
    {id:'salary', name:'工资', icon:'💰', color:'#11b886'},
    {id:'bonus',  name:'奖金', icon:'🎁', color:'#ff9f1c'},
    {id:'invest', name:'理财', icon:'📈', color:'#3c7dff'},
    {id:'other_i',name:'其他', icon:'🪙', color:'#9aa0ad'},
  ]
};
let records = load(LS_REC, []);
let cats = load(LS_CAT, null) || JSON.parse(JSON.stringify(DEFAULT_CATS));

function load(k, def){ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?def:v; }catch(e){ return def; } }
/* 「其他」永远排到该类型末尾 */
function isOther(c){ return c.id==='other_e' || c.id==='other_i' || c.name==='其他'; }
function normalizeCatOrder(){
  ['expense','income'].forEach(type=>{
    if(!cats[type]) return;
    cats[type] = [...cats[type].filter(c=>!isOther(c)), ...cats[type].filter(isOther)];
  });
}
normalizeCatOrder();
function save(){ normalizeCatOrder();
                 localStorage.setItem(LS_REC, JSON.stringify(records));
                 localStorage.setItem(LS_CAT, JSON.stringify(cats)); }
function catById(type,id){ return cats[type].find(c=>c.id===id) || {name:'未分类',icon:'❓',color:'#9aa0ad'}; }
function fmt(n, symbol){ return (symbol||'¥') + Number(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}); }

/* =================== 币种与汇率（基准 = 人民币 cny）=================== */
const LS_CUR = 'et_currencies', LS_RATES = 'et_rates';
const CUR_CATALOG = {
  cny:{symbol:'¥',name:'人民币'},   usd:{symbol:'$',name:'美元'},
  eur:{symbol:'€',name:'欧元'},     gbp:{symbol:'£',name:'英镑'},
  jpy:{symbol:'JP¥',name:'日元'},   hkd:{symbol:'HK$',name:'港币'},
  twd:{symbol:'NT$',name:'新台币'}, krw:{symbol:'₩',name:'韩元'},
  sgd:{symbol:'S$',name:'新加坡元'},aud:{symbol:'A$',name:'澳元'},
  cad:{symbol:'C$',name:'加元'},    thb:{symbol:'฿',name:'泰铢'},
  myr:{symbol:'RM',name:'林吉特'},  rub:{symbol:'₽',name:'卢布'},
};
let currencies = load(LS_CUR, null) || [{code:'cny',symbol:'¥',name:'人民币'}];
let rates = load(LS_RATES, null);   // { date:'YYYY-MM-DD', map:{usd:0.14,...} }（cny 恒为 1）

function saveCur(){ localStorage.setItem(LS_CUR, JSON.stringify(currencies)); }
function curInfo(code){
  code = code || 'cny';
  return currencies.find(c=>c.code===code)
      || (CUR_CATALOG[code] ? {code, ...CUR_CATALOG[code]}
                            : {code, symbol:code.toUpperCase(), name:code.toUpperCase()});
}
function rateOf(code){ if(code==='cny'||!code) return 1; return (rates && rates.map) ? rates.map[code] : null; }
/* 任意币种金额 → 人民币；缺汇率时退回原值 */
function toCNY(amount, code){ const r = rateOf(code); return r ? amount/r : amount; }

/* 统计单位（汇总用的币种）：默认人民币，可在设置里改 */
const LS_UNIT = 'et_statunit';
let statUnit = localStorage.getItem(LS_UNIT) || 'cny';
function unitRate(){ return rateOf(statUnit) || 1; }       // 统计单位 / 1 元
function unitSymbol(){ return curInfo(statUnit).symbol; }
/* 任意币种金额 → 统计单位 */
function toUnit(amount, code){ return toCNY(amount, code) * unitRate(); }
function esc(s){ return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

/* 按分类名关键词自动猜 emoji（命中即返回，否则 null，交给 AI 兜底） */
const ICON_RULES = [
  [['工资','薪','收入','奖金','报销','退款','红包','转入'],'💰'],
  [['理财','基金','股','投资','利息','分红'],'📈'],
  [['茶','咖啡','奶茶','饮料','喝'],'☕'],
  [['酒','啤酒','烟'],'🍺'],
  [['零食','小吃','薯','糖','巧克力'],'🍿'],
  [['水果'],'🍎'],
  [['买菜','超市','生鲜','蔬','杂货','食材'],'🥬'],
  [['餐','饭','吃','食','外卖','馆','夜宵'],'🍜'],
  [['机票','旅','酒店','度假','出游','景点'],'✈️'],
  [['打车','地铁','公交','车费','出行','滴滴','高铁','火车','加油','油费','停车','交通'],'🚌'],
  [['衣','鞋','裤','穿','打扮','包包','服饰'],'👕'],
  [['数码','电器','手机','电脑','耳机','电子','相机','配件'],'💻'],
  [['话费','通讯','流量','宽带','网费'],'📱'],
  [['水费','电费','燃气','煤气','缴费','账单','物业'],'💡'],
  [['房租','房贷','住房','按揭'],'🏠'],
  [['游戏','娱乐','电影','ktv','唱','演出'],'🎮'],
  [['运动','健身','球','跑','游泳','瑜伽'],'🏃'],
  [['医','药','病','诊','体检','挂号'],'💊'],
  [['学','书','教育','培训','课','考'],'📚'],
  [['美容','护肤','化妆','理发','美发','spa'],'💄'],
  [['宠物','猫','狗'],'🐾'],
  [['孩','宝','母婴','奶粉','尿'],'🍼'],
  [['礼','送'],'🎁'],
  [['捐','公益'],'🤝'],
  [['家具','家居','装修','日用'],'🛋️'],
  [['购','买','网购','淘宝','京东','拼多多'],'🛍️'],
];
function guessIcon(name){
  const s=(name||'').toLowerCase();
  for(const [keys,icon] of ICON_RULES) if(keys.some(k=>s.includes(k))) return icon;
  return null;
}
function today(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

/* 当前查看的年月 */
let viewYear, viewMonth;
(function(){ const d=new Date(); viewYear=d.getFullYear(); viewMonth=d.getMonth(); })();

function monthRecords(){
  return records.filter(r=>{ const d=new Date(r.date);
    return d.getFullYear()===viewYear && d.getMonth()===viewMonth; });
}

/* 整页重绘：顶部 + 明细 + 统计 */
function renderAll(){ renderTop(); renderList(); renderStats(); }
