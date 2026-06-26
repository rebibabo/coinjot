/* =================== 语音输入 ===================
   · App 端：点 🎤 聚焦输入框 + 弹出系统键盘，用「输入法自带的语音输入」说话
     （最稳、无需任何权限——就是平时打字时键盘上的那个麦克风）。
   · 浏览器端：用 Web Speech API 直接识别。 */
const micBtn = document.getElementById('micBtn');
let recOn = false;

micBtn.onclick = ()=>{ if(recOn) return; startVoice(); };
function setRec(on){ recOn = on; micBtn.classList.toggle('rec', on); micBtn.textContent = on ? '●' : '🎤'; }
function gotVoice(text){ setRec(false); if(!text || !text.trim()) return; aiInput.value = text.trim(); runAI(); }

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

  // App：聚焦输入框 + 弹键盘，用输入法的语音输入
  aiInput.focus();
  const KB = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
  if(KB && KB.show) KB.show().catch(()=>{});
  if(window.showToast) showToast('点键盘上的 🎤 说话，说完点「识别」', '', null, 5000);
}
