/* =================== 语音输入 ===================
   双通道自动适配：
   · App 端（Capacitor）→ 调用系统原生语音识别（@capacitor-community/speech-recognition）
   · 浏览器端          → 退回 Web Speech API
   识别出文字后填入 aiInput 并自动触发 AI 解析（依赖 ai.js 的 aiInput / runAI）。 */
const micBtn = document.getElementById('micBtn');
let recOn = false;

micBtn.onclick = ()=>{ if(recOn) return; startVoice(); };

function setRec(on){ recOn = on; micBtn.classList.toggle('rec', on); micBtn.textContent = on ? '●' : '🎤'; }

function gotVoice(text){
  setRec(false);
  if(!text || !text.trim()) return;
  aiInput.value = text.trim();
  runAI();              // 说完直接解析成一笔账
}

async function startVoice(){
  const cap = window.Capacitor;
  // ---- App 端：系统原生识别 ----
  if(cap && cap.Plugins && cap.Plugins.SpeechRecognition){
    const SR = cap.Plugins.SpeechRecognition;
    try{
      const { available } = await SR.available();
      if(!available){ alert('当前设备不支持语音识别'); return; }
      const perm = await SR.requestPermissions();
      if(perm && perm.speechRecognition === 'denied'){ alert('请在系统设置里允许麦克风/语音权限'); return; }
      setRec(true);
      const res = await SR.start({
        language:'zh-CN', maxResults:1, partialResults:false, popup:false
      });
      gotVoice(res && res.matches && res.matches[0]);
    }catch(err){
      setRec(false);
      const m = String((err && (err.message || err.code || err)) || '');
      const map = {'1':'网络超时','2':'语音服务不可用或网络受限','3':'录音失败','4':'服务出错',
        '5':'客户端错误','6':'没听到声音','7':'没听清，请再说一次','8':'识别忙，请稍候','9':'缺少麦克风权限'};
      const friendly = map[m] || (/no match|didn't understand/i.test(m) ? '没听清，请再说一次' : ('语音识别出错：'+m));
      alert(friendly + (['2','4','5'].includes(m) ? '\n可改用文字或键盘输入' : ''));
    }
    return;
  }
  // ---- 浏览器端：Web Speech API ----
  const WSR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!WSR){ alert('当前浏览器不支持语音识别，请在 App 内或 Chrome 中使用'); return; }
  const rec = new WSR();
  rec.lang = 'zh-CN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = e => gotVoice(e.results[0][0].transcript);
  rec.onerror = e => {
    setRec(false);
    if(e.error==='not-allowed' || e.error==='service-not-allowed')
      alert('麦克风被拒绝。本地预览请用 https 或 localhost（如 npx serve）');
    else if(e.error!=='no-speech' && e.error!=='aborted')
      alert('语音识别出错：' + e.error);
  };
  rec.onend = () => setRec(false);
  setRec(true);
  rec.start();
}
