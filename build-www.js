/* 把纯前端源文件拷进 www/（Capacitor 打包的 webDir）。
   改了源码后需重新执行：npm run copyweb（CI 会自动跑）。 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, 'www');

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
