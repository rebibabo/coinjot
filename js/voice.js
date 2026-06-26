/* =================== 语音输入（系统语音识别）===================
   · App 端：调用系统 SpeechRecognizer（@capacitor-community/speech-recognition），
     先申请麦克风权限，授权后弹出系统识别。
   · 浏览器端：Web Speech API。
   识别出文字后填入 aiInput 并自动触发解析（依赖 ai.js 的 aiInput / runAI）。 */
const micBtn = document.getElementById('micBtn');
let recOn = false;

micBtn.onclick = ()=>{ if(recOn) return; startVoice(); };
function setRec(on){ recOn = on; micBtn.classList.toggle('rec', on); micBtn.textContent = on ? '●' : '🎤'; }
function gotVoice(text){ setRec(false); if(!text || !text.trim()) return; aiInput.value = text.trim(); runAI(); }

async function startVoice(){
  const cap = window.Capacitor;
  const SR = cap && cap.Plugins && cap.Plugins.SpeechRecognition;

  if(SR){   // ---- App：系统语音识别 ----
    try{
      const a = await SR.available();
      if(a && a.available === false){ alert('当前设备不支持系统语音识别'); return; }
      let perm = {};
      try{ perm = await SR.checkPermissions(); }catch(_){}
      if(perm.speechRecognition !== 'granted'){
        try{ perm = await SR.requestPermissions(); }catch(_){}
      }
      if(perm.speechRecognition !== 'granted'){
        alert('未获得麦克风权限。请到「设置 → 应用 → 记账 → 权限 → 麦克风」开启后重试');
        return;
      }
      setRec(true);
      const res = await SR.start({ language:'zh-CN', maxResults:1, partialResults:false, popup:false });
      gotVoice(res && res.matches && res.matches[0]);
    }catch(err){
      setRec(false);
      const m = String((err && (err.message || err.code || err)) || '');
      const map = {'1':'网络超时','2':'网络受限/语音服务不可用','3':'录音失败','4':'服务出错',
        '5':'客户端错误','6':'没听到声音，请对着麦克风说','7':'没听清，请再说一次','8':'识别忙，请稍候','9':'缺少麦克风权限'};
      alert(map[m] || (/no match|didn't understand/i.test(m) ? '没听清，请再说一次' : ('语音识别出错：'+m)));
    }
    return;
  }

  // ---- 浏览器：Web Speech API ----
  const WSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!WSR){ alert('当前环境不支持语音识别，请在 App 内或 Chrome 使用'); return; }
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
}
