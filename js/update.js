/* =================== 应用内检查更新（Gitee 托管） ===================
   启动时读取 Gitee 上的 version.json，若 versionCode 比本地新则弹窗引导下载新 APK。
   发版流程：1) 改本文件的 APP_VERSION（code +1、name 改新）
            2) 改仓库根 version.json（同样的 code/name + 新的 notes）
            3) 把新 APK 传到 Gitee Release，version.json 传到 Gitee 仓库 raw 路径。 */

const APP_VERSION = { code: 5, name: '1.0.4' };   // ← 每次发版同步这里

/* ↓↓↓ 你的 Gitee 用户名（仓库名 coinjot、默认分支 main） ↓↓↓ */
const GITEE_USER = 'yuan-zhongsheng';
const VERSION_URL = `https://gitee.com/${GITEE_USER}/coinjot/raw/main/version.json`;

async function fetchJSON(url){
  const HTTP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
  if(HTTP){
    const r = await HTTP.get({ url, headers:{} });
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  }
  const r = await fetch(url, { cache:'no-store' });
  return r.json();
}

let updInfo = null;
async function checkUpdate(manual){
  try{
    const info = await fetchJSON(VERSION_URL + '?t=' + Date.now());
    if(!info || typeof info.versionCode !== 'number') throw new Error('bad json');
    if(info.versionCode > APP_VERSION.code){
      if(!manual && String(info.versionCode) === localStorage.getItem('et_skipupd')) return;  // 已选“以后再说”不再打扰
      updInfo = info; showUpdate(info);
    } else if(manual){
      showToast('已是最新版本 v' + APP_VERSION.name);
    }
  }catch(e){
    if(manual) showToast('检查更新失败，请稍后再试');
  }
}

function showUpdate(info){
  document.getElementById('updVer').textContent = 'v' + (info.versionName || '');
  document.getElementById('updNotes').textContent = info.notes || '有新版本可用。';
  document.getElementById('updModal').classList.add('show');
}
function closeUpdate(){ document.getElementById('updModal').classList.remove('show'); }

const _updNow = document.getElementById('updNow');
const _updLater = document.getElementById('updLater');

function resetUpdBtn(){
  _updNow.disabled = false; _updLater.disabled = false; _updNow.textContent = '立即更新';
}

_updNow.onclick = async ()=>{
  const url = updInfo && updInfo.apkUrl;
  if(!url) return;
  const isApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  const P = window.Capacitor && window.Capacitor.Plugins;
  // 浏览器或缺插件 → 退回浏览器下载
  if(!isApp || !P || !P.Filesystem || !P.FileOpener){ window.open(url, '_blank'); closeUpdate(); return; }

  let ph = null;
  try{
    _updNow.disabled = true; _updLater.disabled = true; _updNow.textContent = '下载中…';
    if(P.Filesystem.addListener){
      ph = await P.Filesystem.addListener('progress', s=>{
        if(s && s.contentLength) _updNow.textContent = '下载中 ' + Math.floor(s.bytes / s.contentLength * 100) + '%';
      });
    }
    const res = await P.Filesystem.downloadFile({
      url, path:'coinjot-update.apk', directory:'CACHE', progress:true
    });
    if(ph && ph.remove) ph.remove(); ph = null;
    _updNow.textContent = '安装中…';
    await P.FileOpener.open({
      filePath: res.path || res.uri,
      contentType:'application/vnd.android.package-archive'
    });
    resetUpdBtn(); closeUpdate();   // 系统安装框已弹出，交给用户点“安装”
  }catch(e){
    if(ph && ph.remove) ph.remove();
    resetUpdBtn();
    if(window.showToast) showToast('下载失败，改用浏览器下载');
    window.open(url, '_blank'); closeUpdate();
  }
};
_updLater.onclick = ()=>{
  if(updInfo) localStorage.setItem('et_skipupd', String(updInfo.versionCode));
  closeUpdate();
};

/* 设置页「关于」 */
const _aboutVer = document.getElementById('aboutVer');
if(_aboutVer) _aboutVer.textContent = 'v' + APP_VERSION.name;
const _btnCheck = document.getElementById('btnCheckUpd');
if(_btnCheck) _btnCheck.onclick = ()=> checkUpdate(true);

/* 启动后延迟静默检查一次（此时 app.js 已加载，showToast 可用） */
setTimeout(()=> checkUpdate(false), 1500);
