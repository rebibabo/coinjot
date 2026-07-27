/* 把纯前端源文件拷进 www/（Capacitor 打包的 webDir）。
   改了源码后需重新执行：npm run copyweb（CI 会自动跑）。 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'www');

function readEnvFile(file){
  if(!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line=>{
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if(!m) return [];
      let value = m[2];
      if((value.startsWith('"') && value.endsWith('"')) ||
         (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      return [[m[1], value]];
    })
  );
}

const localEnv = readEnvFile(path.join(root, '.env'));
const voiceDefaultsFile = path.join(root, 'js', 'voice-defaults.js');
const voiceDefaults = {
  appId:process.env.SPEECHREC_APPID || process.env.XFYUN_APP_ID
    || localEnv.SPEECHREC_APPID || localEnv.XFYUN_APP_ID || '',
  apiKey:process.env.SPEECHREC_APIKEY || process.env.XFYUN_API_KEY
    || localEnv.SPEECHREC_APIKEY || localEnv.XFYUN_API_KEY || '',
  apiSecret:process.env.SPEECHREC_SECRETKEY || process.env.XFYUN_API_SECRET
    || localEnv.SPEECHREC_SECRETKEY || localEnv.XFYUN_API_SECRET || ''
};
const hasVoiceDefaults = voiceDefaults.appId && voiceDefaults.apiKey && voiceDefaults.apiSecret;
if(hasVoiceDefaults || !fs.existsSync(voiceDefaultsFile)){
  fs.writeFileSync(
    voiceDefaultsFile,
    `window.XFYUN_DEFAULT_CONFIG=${JSON.stringify(voiceDefaults)};\n`
  );
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function copy(src, dst){
  const st = fs.statSync(src);
  if(st.isDirectory()){
    fs.mkdirSync(dst, { recursive: true });
    for(const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f));
  } else {
    fs.copyFileSync(src, dst);
  }
}

fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
for(const dir of ['css', 'js', 'resources']){
  const p = path.join(root, dir);
  if(fs.existsSync(p)) copy(p, path.join(out, dir));
}

console.log('www/ built:', fs.readdirSync(out).join(', '));
