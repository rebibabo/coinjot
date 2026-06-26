/* =================== 语音输入 ===================
   · App 端：优先调用系统语音识别（@capacitor-community/speech-recognition）。
     点 🎤 时先做三层探测（available / checkPermissions / start），
     探测结果会 alert 出来，便于定位卡在哪一层；任何一层不通就自动回退到「输入法语音」。
   · 浏览器端：用 Web Speech API 直接识别。 */
const micBtn = document.getElementById('micBtn');
let recOn = false;

micBtn.onclick = ()=>{ if(recOn) return; startVoice(); };
function setRec(on){ recOn = on; micBtn.classList.toggle('rec', on); micBtn.textContent = on ? '●' : '🎤'; }
function gotVoice(text){ setRec(false); if(!text || !text.trim()) return; aiInput.value = text.trim(); runAI(); }

/* 回退：聚焦输入框 + 弹键盘，用输入法自带的语音输入（无需任何权限，最稳） */
function imeVoice(){
  setRec(false);
  aiInput.focus();
  const KB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
  if(KB && KB.show) KB.show().catch(()=>{});
  if(window.showToast) showToast('点键盘上的 🎤 说话，说完点「识别」', '', null, 5000);
}

function startVoice(){
  const isApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  const WSR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // 浏览器（非 App）且支持 Web Speech → 直接识别
  if(!isApp && WSR){
    const rec = new WSR();
    rec.lang = 'zh-CN'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = e => gotVoice(e.results[0][0].transcript);
    rec.onerror = e => {
      setRec(false);
      if(e.error==='not-allowed' || e.error==='service-not-allowed')
        alert('麦克风被拒绝。本地预览请用 https 或 localhost（如 npx serve）');
      else if(e.error!=='no-speech' && e.error!=='aborted')
        alert('语音识别出错：' + e.error);
    };
    rec.onend = () => setRec(false);
    setRec(true); rec.start();
    return;
  }

  if(isApp){ nativeVoice(); return; }
  // 浏览器但不支持 Web Speech
  imeVoice();
}

async function nativeVoice(){
  const SR = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SpeechRecognition;
  if(!SR){ alert('原生语音插件未加载，改用输入法语音'); imeVoice(); return; }

  try{
    // —— 三层探测：到底卡在哪一层 ——
    const a = await SR.available();
    let p = await SR.checkPermissions();
    if(p && p.speechRecognition !== 'granted'){
      p = await SR.requestPermissions();   // 没授权先申请一次
    }
    alert('available=' + JSON.stringify(a) + '\nperm=' + JSON.stringify(p));

    const ok = a && (a.available === true || a === true);
    if(!ok){ imeVoice(); return; }                       // 第 1 层：无识别引擎
    if(p && p.speechRecognition !== 'granted'){ imeVoice(); return; } // 第 2 层：权限被挡

    // 第 3 层：引擎在、权限有 → 真正开始识别
    setRec(true);
    const res = await SR.start({
      language: 'zh-CN', maxResults: 1, partialResults: false, popup: false
    });
    const text = res && res.matches && res.matches[0];
    gotVoice(text);
  }catch(err){
    setRec(false);
    alert('start() 抛错：' + (err && (err.message || err.code || JSON.stringify(err)) || err) + '\n改用输入法语音');
    imeVoice();
  }
}
