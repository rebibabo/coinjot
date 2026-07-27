/* =================== 讯飞语音听写（WebSocket 流式 WebAPI） ===================
   不依赖系统语音服务。麦克风音频转 16k/16bit/单声道 PCM，
   实时发送到讯飞并把增量结果写进「一句话记账」输入框。 */
const LS_VOICE_CONFIG = 'et_voice_xfyun';
const XFYUN_HOST = 'iat-api.xfyun.cn';
const XFYUN_PATH = '/v2/iat';
const XFYUN_RATE = 16000;
const DEFAULT_VOICE_CONFIG = normalizeVoiceConfig(window.XFYUN_DEFAULT_CONFIG);

let voiceConfig = loadVoiceConfig();
let voiceSocket = null;
let voiceStream = null;
let voiceContext = null;
let voiceSource = null;
let voiceProcessor = null;
let voiceState = 'idle';
let voiceFirstFrame = true;
let voiceBaseText = '';
let voiceSegments = new Map();
let voiceStopTimer = null;
let voiceFinishTimer = null;
let voiceSession = 0;
let voiceMode = 'sheet';
let quickVoiceSubmitting = false;
let quickVoiceRun = 0;

const voiceModal = document.getElementById('voiceModal');
const voiceBtn = document.getElementById('voiceBtn');
const voiceHint = document.getElementById('voiceHint');
const tabAdd = document.getElementById('tabAdd');
const quickVoice = document.getElementById('quickVoice');
const quickVoiceTitle = document.getElementById('quickVoiceTitle');
const quickVoiceText = document.getElementById('quickVoiceText');
const quickVoiceHint = document.getElementById('quickVoiceHint');
const quickVoiceEdit = document.getElementById('quickVoiceEdit');
const voiceDefaultHint = '点按持续听写，再点停止；也可按住说话、松开停止';

function loadVoiceConfig(){
  try{
    const v = JSON.parse(localStorage.getItem(LS_VOICE_CONFIG) || '{}');
    const saved = normalizeVoiceConfig(v);
    if(v.custom===true && isCompleteVoiceConfig(saved)) return saved;
    if(isCompleteVoiceConfig(DEFAULT_VOICE_CONFIG)) return {...DEFAULT_VOICE_CONFIG};
    return isCompleteVoiceConfig(saved) ? saved : {...DEFAULT_VOICE_CONFIG};
  }catch(e){ return {...DEFAULT_VOICE_CONFIG}; }
}
function getVoiceConfig(){ return {...voiceConfig}; }
function setVoiceConfig(v){
  const next = normalizeVoiceConfig(v);
  if(isCompleteVoiceConfig(next)){
    voiceConfig = next;
    localStorage.setItem(LS_VOICE_CONFIG, JSON.stringify({...voiceConfig, custom:true}));
  }else{
    localStorage.removeItem(LS_VOICE_CONFIG);
    voiceConfig = {...DEFAULT_VOICE_CONFIG};
  }
  renderVoiceSettings();
}
function normalizeVoiceConfig(v){
  return {
    appId:String(v && v.appId || '').trim(),
    apiKey:String(v && v.apiKey || '').trim(),
    apiSecret:String(v && v.apiSecret || '').trim()
  };
}
function isCompleteVoiceConfig(v){ return !!(v.appId && v.apiKey && v.apiSecret); }
function isVoiceConfigured(){
  return isCompleteVoiceConfig(voiceConfig);
}
function renderVoiceSettings(){
  const label = document.getElementById('voiceConfigLabel');
  if(label) label.textContent = (isVoiceConfigured() ? '已配置' : '未配置') + ' ›';
}

function openVoiceConfig(){
  document.getElementById('voiceAppId').value = voiceConfig.appId;
  document.getElementById('voiceApiKey').value = voiceConfig.apiKey;
  document.getElementById('voiceApiSecret').value = voiceConfig.apiSecret;
  document.getElementById('voiceShowSecret').checked = false;
  toggleVoiceSecret(false);
  voiceModal.classList.add('show');
}
function closeVoiceConfig(){ voiceModal.classList.remove('show'); }
function toggleVoiceSecret(show){
  document.getElementById('voiceApiKey').type = show ? 'text' : 'password';
  document.getElementById('voiceApiSecret').type = show ? 'text' : 'password';
}

document.getElementById('btnVoiceConfig').onclick = openVoiceConfig;
document.getElementById('voiceCancel').onclick = closeVoiceConfig;
document.getElementById('voiceShowSecret').onchange = e=>toggleVoiceSecret(e.target.checked);
document.getElementById('voiceSave').onclick = ()=>{
  const next = {
    appId:document.getElementById('voiceAppId').value,
    apiKey:document.getElementById('voiceApiKey').value,
    apiSecret:document.getElementById('voiceApiSecret').value
  };
  if(!next.appId.trim() || !next.apiKey.trim() || !next.apiSecret.trim()){
    showAlert('请完整填写 APPID、APIKey 和 APISecret');
    return;
  }
  setVoiceConfig(next);
  closeVoiceConfig();
  showToast('讯飞语音已配置');
};
document.getElementById('voiceClear').onclick = async ()=>{
  const hasDefault = isCompleteVoiceConfig(DEFAULT_VOICE_CONFIG);
  if(!isVoiceConfigured() && !hasDefault){ closeVoiceConfig(); return; }
  const prompt = hasDefault
    ? '清除本机修改，恢复应用内置的讯飞语音配置？'
    : '清除本机保存的讯飞语音凭据？';
  if(!(await showConfirm(prompt))) return;
  setVoiceConfig(null);
  closeVoiceConfig();
  showToast(hasDefault ? '已恢复内置语音配置' : '已清除语音配置');
};
voiceModal.onclick = e=>{ if(e.target===voiceModal) closeVoiceConfig(); };

function setVoiceUi(state, text, error){
  voiceState = state;
  const inSheet = voiceMode==='sheet';
  voiceBtn.classList.toggle('connecting', inSheet && state==='connecting');
  voiceBtn.classList.toggle('listening', inSheet && state==='listening');
  voiceBtn.classList.toggle('processing', inSheet && state==='processing');
  voiceBtn.setAttribute('aria-label', state==='listening' ? '停止语音输入' : '语音输入');
  if(inSheet){
    voiceHint.textContent = text || voiceDefaultHint;
    voiceHint.classList.toggle('voice-active', state!=='idle' && !error);
    voiceHint.classList.toggle('voice-error', !!error);
  }else{
    quickVoice.classList.toggle('listening', state==='listening');
    quickVoice.classList.toggle('processing', state==='connecting' || state==='processing');
    if(state==='connecting'){
      quickVoiceTitle.textContent = '正在连接语音服务';
      quickVoiceHint.textContent = '请继续按住';
    }else if(state==='listening'){
      quickVoiceTitle.textContent = '正在听写';
      quickVoiceHint.textContent = text || '松开后自动识别并记账';
    }else if(state==='processing'){
      quickVoiceTitle.textContent = '正在整理语音';
      quickVoiceHint.textContent = text || '马上为你记账';
    }
  }
}

function toggleSheetVoice(){
  if(voiceState==='idle') startVoiceListening();
  else if(voiceState==='connecting') cancelVoiceListening();
  else if(voiceState==='listening') stopVoiceListening();
}

async function startVoiceListening(options={}){
  const nextMode = options.mode==='quick' ? 'quick' : 'sheet';
  if(!isVoiceConfigured()){
    openVoiceConfig();
    showToast('请先填写讯飞语音凭据');
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showAlert('当前环境不支持麦克风录音，请在 App 中使用');
    return;
  }
  cancelVoiceListening({preserveQuick:nextMode==='quick'});
  voiceMode = nextMode;
  quickVoiceSubmitting = false;
  if(voiceMode==='quick') showQuickVoice();
  const session = ++voiceSession;
  setVoiceUi('connecting', '正在连接讯飞语音…');
  voiceBaseText = voiceMode==='quick' ? '' : document.getElementById('aiInput').value.trim();
  voiceSegments = new Map();
  document.getElementById('aiInput').blur();
  hideNativeKeyboard();
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      audio:{channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true}
    });
    if(session!==voiceSession){
      stream.getTracks().forEach(t=>t.stop());
      return;
    }
    voiceStream = stream;
    const url = await buildVoiceUrl();
    if(session!==voiceSession) return;
    voiceSocket = new WebSocket(url);
    voiceSocket.onopen = beginVoiceCapture;
    voiceSocket.onmessage = handleVoiceMessage;
    voiceSocket.onerror = ()=>voiceFail('连接讯飞失败，请检查网络');
    voiceSocket.onclose = ()=>{
      if(voiceState!=='idle' && voiceState!=='processing') voiceFail('语音连接已断开');
    };
    voiceStopTimer = setTimeout(()=>stopVoiceListening(), 60000);
  }catch(err){
    const denied = err && (err.name==='NotAllowedError' || err.name==='PermissionDeniedError');
    voiceFail(denied ? '请允许 App 使用麦克风' : ('语音启动失败：'+(err.message || err)));
  }
}

async function beginVoiceCapture(){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    voiceContext = new AudioCtx();
    if(voiceContext.state==='suspended') await voiceContext.resume();
    voiceSource = voiceContext.createMediaStreamSource(voiceStream);
    // 约 40ms 一批音频，兼顾讯飞流式传输节奏和实时文字延迟。
    voiceProcessor = voiceContext.createScriptProcessor(2048, 1, 1);
    voiceFirstFrame = true;
    voiceProcessor.onaudioprocess = e=>sendVoiceAudio(e.inputBuffer.getChannelData(0), voiceContext.sampleRate);
    voiceSource.connect(voiceProcessor);
    voiceProcessor.connect(voiceContext.destination);
    setVoiceUi('listening', voiceMode==='quick'
      ? '松开后自动识别并记账'
      : '正在听写，再点一次停止');
  }catch(err){ voiceFail('无法读取麦克风音频：'+(err.message || err)); }
}

function sendVoiceAudio(input, inputRate){
  if(!voiceSocket || voiceSocket.readyState!==WebSocket.OPEN || voiceState!=='listening') return;
  if(voiceSocket.bufferedAmount > 512000) return;
  const pcm = floatTo16BitPCM(downsample(input, inputRate, XFYUN_RATE));
  const data = {
    status:voiceFirstFrame ? 0 : 1,
    format:'audio/L16;rate=16000',
    encoding:'raw',
    audio:bytesToBase64(new Uint8Array(pcm.buffer))
  };
  const packet = voiceFirstFrame ? {
    common:{app_id:voiceConfig.appId},
    business:{
      language:'zh_cn', domain:'iat', accent:'mandarin',
      vad_eos:1800, dwa:'wpgs'
    },
    data
  } : {data};
  voiceSocket.send(JSON.stringify(packet));
  voiceFirstFrame = false;
}

function stopVoiceListening(){
  if(voiceState==='idle') return;
  if(voiceState==='connecting'){ cancelVoiceListening(); return; }
  clearTimeout(voiceStopTimer);
  stopVoiceAudio();
  if(voiceSocket && voiceSocket.readyState===WebSocket.OPEN){
    voiceSocket.send(JSON.stringify({data:{
      status:2, format:'audio/L16;rate=16000', encoding:'raw', audio:''
    }}));
    setVoiceUi('processing', voiceMode==='quick' ? '马上为你记账' : '正在整理识别结果…');
    clearTimeout(voiceFinishTimer);
    voiceFinishTimer = setTimeout(()=>finishVoice(true), 5000);
  }else{
    finishVoice(false);
  }
}

function cancelVoiceListening(options={}){
  const wasQuick = voiceMode==='quick';
  voiceSession++;
  clearTimeout(voiceStopTimer);
  clearTimeout(voiceFinishTimer);
  stopVoiceAudio();
  if(voiceSocket){
    voiceSocket.onclose = null;
    try{ voiceSocket.close(1000); }catch(e){}
  }
  voiceSocket = null;
  setVoiceUi('idle');
  if(wasQuick && !options.preserveQuick) hideQuickVoice();
  voiceMode = 'sheet';
}

function stopVoiceAudio(){
  if(voiceProcessor){ voiceProcessor.onaudioprocess=null; try{ voiceProcessor.disconnect(); }catch(e){} }
  if(voiceSource){ try{ voiceSource.disconnect(); }catch(e){} }
  if(voiceStream){ voiceStream.getTracks().forEach(t=>t.stop()); }
  if(voiceContext){ voiceContext.close().catch(()=>{}); }
  voiceProcessor = voiceSource = voiceStream = voiceContext = null;
}

function handleVoiceMessage(event){
  let msg;
  try{ msg = JSON.parse(event.data); }catch(e){ return; }
  if(msg.code){
    const auth = [10105,10106,10107,10110,10313].includes(Number(msg.code));
    voiceFail(auth ? '讯飞鉴权失败，请检查三项凭据和手机时间' : `讯飞识别失败（${msg.code}）：${msg.message || '未知错误'}`);
    return;
  }
  if(msg.data && msg.data.result) applyVoiceResult(msg.data.result);
  if(msg.data && msg.data.status===2) finishVoice(true);
}

function applyVoiceResult(result){
  const sn = Number(result.sn || 0);
  const text = (result.ws || []).map(x=>(x.cw && x.cw[0] ? x.cw[0].w : '')).join('');
  if(result.pgs==='rpl' && Array.isArray(result.rg)){
    for(let i=result.rg[0]; i<=result.rg[1]; i++) voiceSegments.delete(i);
  }
  voiceSegments.set(sn, text);
  const heard = [...voiceSegments.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join('');
  const combined = voiceBaseText
    ? voiceBaseText + (heard ? ' ' + heard : '')
    : heard;
  document.getElementById('aiInput').value = combined;
  if(voiceMode==='quick'){
    quickVoiceText.textContent = heard || '请说出金额和用途';
    quickVoiceText.classList.toggle('placeholder', !heard);
  }else if(voiceState==='listening'){
    setVoiceUi('listening', '正在听写，再点一次停止');
  }
}

function finishVoice(success){
  const finishedMode = voiceMode;
  clearTimeout(voiceStopTimer);
  clearTimeout(voiceFinishTimer);
  stopVoiceAudio();
  if(voiceSocket){
    voiceSocket.onclose = null;
    try{ voiceSocket.close(1000); }catch(e){}
  }
  voiceSocket = null;
  const finalText = document.getElementById('aiInput').value.trim();
  const hasText = finalText!==voiceBaseText;
  setVoiceUi('idle', success && hasText ? '识别完成，点击“识别”记账' : voiceDefaultHint);
  if(finishedMode==='quick'){
    if(success && hasText && !quickVoiceSubmitting){
      quickVoiceSubmitting = true;
      submitQuickVoice(finalText);
    }else if(!hasText){
      showQuickVoiceError('没有听清内容，请再试一次', false);
    }
  }
}

function voiceFail(message){
  const wasQuick = voiceMode==='quick';
  cancelVoiceListening({preserveQuick:wasQuick});
  if(wasQuick) showQuickVoiceError(message, !!document.getElementById('aiInput').value.trim());
  else setVoiceUi('idle', message, true);
  showToast(message, null, null, 5000);
}

function showQuickVoice(){
  quickVoice.className = 'quick-voice show';
  quickVoiceTitle.textContent = '正在准备语音输入';
  quickVoiceText.textContent = '请说出金额和用途';
  quickVoiceText.classList.add('placeholder');
  quickVoiceHint.textContent = '松开后自动识别并记账';
  quickVoiceEdit.style.display = '';
}
function hideQuickVoice(){
  quickVoiceRun++;
  quickVoice.className = 'quick-voice';
  tabAdd.classList.remove('voice-hold');
  if(voiceState==='idle') voiceMode = 'sheet';
}
function showQuickVoiceError(message, canEdit){
  quickVoice.className = 'quick-voice show error';
  quickVoiceTitle.textContent = '没有完成记账';
  quickVoiceHint.textContent = message;
  quickVoiceEdit.style.display = canEdit ? 'block' : 'none';
}
async function submitQuickVoice(text){
  const run = ++quickVoiceRun;
  quickVoice.className = 'quick-voice show processing';
  quickVoiceTitle.textContent = '正在识别账目';
  quickVoiceText.textContent = text;
  quickVoiceText.classList.remove('placeholder');
  quickVoiceHint.textContent = '正在匹配金额和分类';
  const ok = typeof runQuickVoiceAI==='function' && await runQuickVoiceAI(text);
  if(run!==quickVoiceRun) return;
  if(ok){
    quickVoice.className = 'quick-voice show success';
    quickVoiceTitle.textContent = '已完成记账';
    quickVoiceHint.textContent = '账目已保存';
    setTimeout(hideQuickVoice, 900);
  }else{
    showQuickVoiceError('可以打开记账页修改识别文字', true);
  }
}

async function buildVoiceUrl(){
  const date = new Date().toUTCString();
  const origin = `host: ${XFYUN_HOST}\ndate: ${date}\nGET ${XFYUN_PATH} HTTP/1.1`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(voiceConfig.apiSecret),
    {name:'HMAC', hash:'SHA-256'}, false, ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(origin));
  const signature = bytesToBase64(new Uint8Array(signed));
  const auth = `api_key="${voiceConfig.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  return `wss://${XFYUN_HOST}${XFYUN_PATH}`
    + `?authorization=${encodeURIComponent(btoa(auth))}`
    + `&date=${encodeURIComponent(date)}`
    + `&host=${encodeURIComponent(XFYUN_HOST)}`;
}

function downsample(buffer, inputRate, outputRate){
  if(inputRate===outputRate) return new Float32Array(buffer);
  const ratio = inputRate/outputRate;
  const length = Math.max(1, Math.round(buffer.length/ratio));
  const result = new Float32Array(length);
  let sourceOffset = 0;
  for(let i=0; i<length; i++){
    const nextOffset = Math.min(buffer.length, Math.round((i+1)*ratio));
    let sum=0, count=0;
    for(; sourceOffset<nextOffset; sourceOffset++){ sum+=buffer[sourceOffset]; count++; }
    result[i] = count ? sum/count : 0;
  }
  return result;
}
function floatTo16BitPCM(input){
  const out = new Int16Array(input.length);
  for(let i=0; i<input.length; i++){
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s<0 ? s*0x8000 : s*0x7fff;
  }
  return out;
}
function bytesToBase64(bytes){
  let binary = '';
  const step = 8192;
  for(let i=0; i<bytes.length; i+=step){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i+step));
  }
  return btoa(binary);
}
function hideNativeKeyboard(){
  const K = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
  if(K && K.hide) K.hide().catch(()=>{});
}

function bindPressGesture(el, handlers){
  let pointerId = null;
  let holdTimer = null;
  let held = false;
  el.onclick = null;
  el.oncontextmenu = e=>e.preventDefault();
  el.addEventListener('pointerdown', e=>{
    if(pointerId!==null || (e.button!=null && e.button!==0)) return;
    pointerId = e.pointerId;
    held = false;
    try{ el.setPointerCapture(pointerId); }catch(_){}
    holdTimer = setTimeout(()=>{
      held = true;
      if(navigator.vibrate) navigator.vibrate(28);
      handlers.onHoldStart && handlers.onHoldStart();
    }, 420);
  });
  el.addEventListener('pointerup', e=>{
    if(e.pointerId!==pointerId) return;
    clearTimeout(holdTimer);
    try{ el.releasePointerCapture(pointerId); }catch(_){}
    if(held) handlers.onHoldEnd && handlers.onHoldEnd();
    else handlers.onTap && handlers.onTap();
    pointerId = null;
    held = false;
    e.preventDefault();
  });
  el.addEventListener('pointercancel', e=>{
    if(e.pointerId!==pointerId) return;
    clearTimeout(holdTimer);
    if(held) handlers.onHoldCancel && handlers.onHoldCancel();
    pointerId = null;
    held = false;
  });
}

let sheetHoldStarted = false;
bindPressGesture(voiceBtn, {
  onTap:toggleSheetVoice,
  onHoldStart:()=>{
    if(voiceState!=='idle') return;
    sheetHoldStarted = true;
    startVoiceListening({mode:'sheet'});
  },
  onHoldEnd:()=>{
    if(!sheetHoldStarted) return;
    sheetHoldStarted = false;
    stopVoiceListening();
  },
  onHoldCancel:()=>{
    sheetHoldStarted = false;
    cancelVoiceListening();
  }
});

let quickHoldStarted = false;
bindPressGesture(tabAdd, {
  onTap:()=>openSheet(),
  onHoldStart:()=>{
    if(voiceState!=='idle') return;
    quickHoldStarted = true;
    tabAdd.classList.add('voice-hold');
    startVoiceListening({mode:'quick'});
  },
  onHoldEnd:()=>{
    tabAdd.classList.remove('voice-hold');
    if(!quickHoldStarted) return;
    quickHoldStarted = false;
    stopVoiceListening();
  },
  onHoldCancel:()=>{
    quickHoldStarted = false;
    tabAdd.classList.remove('voice-hold');
    cancelVoiceListening();
  }
});

document.getElementById('quickVoiceClose').onclick = ()=>{
  cancelVoiceListening();
  hideQuickVoice();
};
quickVoiceEdit.onclick = ()=>{
  const text = document.getElementById('aiInput').value.trim();
  hideQuickVoice();
  openSheet();
  document.getElementById('aiInput').value = text;
};

renderVoiceSettings();
