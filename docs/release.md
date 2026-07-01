# 发版指南（coinjot）

如何发布一个新版本，让用户在 App 内收到更新提示并一键升级。

## 整体链路

- **GitHub** = 构建 + 源码。推带 `[release]` 的提交 → GitHub Actions 打包 APK。
- **Gitee** = 国内分发。CI 自动把 APK 传到 Gitee Release、并把 `version.json` 同步到 Gitee（国内访问快、不被墙）。
- **App 内更新器**（`js/update.js`）：启动读 `https://gitee.com/yuan-zhongsheng/coinjot/raw/main/version.json`，若里面的 `versionCode` 比 App 内置的 `APP_VERSION.code` 大，就弹更新框，点更新在 App 内下载 Gitee 上的 APK 并唤起系统安装。

> 你**只需要推 GitHub**，Gitee 那边（APK + version.json）由 CI 自动完成，不用再 `git push gitee`。

## 发布一个新版本（4 步）

假设当前是 `code 2 / 1.0.1`，要发 `code 3 / 1.0.2`：

1. **改功能代码**，本地 `npm run copyweb` 后浏览器开 `www/index.html` 自测。
2. **升 App 内版本** —— `js/update.js`：
   ```js
   const APP_VERSION = { code: 3, name: '1.0.2' };
   ```
3. **升远程版本** —— 根目录 `version.json`：
   ```json
   { "versionCode": 3, "versionName": "1.0.2",
     "apkUrl": "https://gitee.com/yuan-zhongsheng/coinjot/releases/download/latest/coinjot.apk",
     "notes": "这一版更新了什么（会显示在更新弹窗里，\\n 换行）" }
   ```
   > ⚠️ **第 2 步和第 3 步的数字必须一致**（都填 3）。不一致会导致用户装完仍反复弹更新。
4. **提交 + 推 GitHub，提交信息带 `[release]`**：
   ```bash
   git commit -am "feat: xxx [release]"
   git push origin main
   ```

之后 CI 自动完成：打包 → 传 APK 到 GitHub Release + Gitee Release → 用 Gitee API 把 `version.json` 同步到 Gitee。几分钟后用户打开 App 就会收到更新。

## 发布开关

- **普通提交不构建**：提交信息不带 `[release]` → CI 跳过（`This job was skipped`），不打包、不覆盖 APK。
- **要发版**：提交信息带 `[release]`，或到 GitHub 仓库 **Actions → Build APK → Run workflow** 手动触发。
- 是否让用户收到更新，另由 `version.json` 的 `versionCode` 决定：带 `[release]` 但不升 versionCode，只是重出 APK（自测用），用户不会被提示。

## 只想测更新弹窗（不真发版）

把 Gitee 上的 `version.json` 的 `versionCode` 临时改成比手机上 App 大的数即可弹更新；测完改回。改法二选一：
- 本地改 `version.json` 后 `git commit -m "test [release]" && git push origin main`（会真打包）；或
- 直接在 Gitee 网页上编辑 `version.json`（不打包，最快）。
> 手机上点「以后再说」会记住该版本号不再打扰（`et_skipupd`）；点「立即更新」不记，会继续按 versionCode 判断。

## 一次性配置（已完成，仅备忘）

- **GitHub Secret `GITEE_TOKEN`**：Gitee 私人令牌（勾 `projects`），用于 CI 上传 APK / 同步 version.json。缺失则 CI 跳过 Gitee 相关步骤、不报错。
- **Gitee 仓库** `gitee.com/yuan-zhongsheng/coinjot`（公开、默认分支 `main`）。
- **固定 debug 签名**：`debug.keystore` 已入库，CI 用它出一致签名，用户 `覆盖安装保留数据`（首次从旧随机签名换过来需卸载一次）。
- **两个远程**：`origin`=GitHub、`gitee`=Gitee。日常只推 `origin`；`gitee` 由 CI 通过 API 维护，**不要再手动 `git push gitee`**（否则可能和 CI 的提交冲突）。

## 已知情况 / 排查

- **Gitee 上传慢（约 3–4 分钟）**：GitHub 海外 runner 跨境传 Gitee 的固有开销，只在发版时发生。上传单次封顶 360s + 3 次重试。想根治只能把构建放国内（自建 runner / Gitee Go）。
- **APK 体积**：教程截图已压成 JPEG（内置图约 0.6MB），整包约 4.9MB。
- **构建串行**：顶层 `concurrency: cancel-in-progress` 保证同一时间只有一个构建，避免多次 `[release]` 并发操作同一 Gitee release 互相删附件。所以**别连续快速推多个 `[release]`**。
- **用户装不上/签名不一致**：见 `debug.keystore` 说明；`INSTALL_FAILED_UPDATE_INCOMPATIBLE` 需卸载重装一次（提醒用户先在 App 导出备份）。
