# coinjot · 记账

✨ 一句话 / 语音 AI 记账 · 多币种自动汇率 · 可视化统计。纯前端零依赖，用 Capacitor 打包成 Android App。

## 功能

- **多种记账**：手动键盘、AI 一句话解析、一句话记多笔、系统语音输入、连续记账
- **AI 智能识别**：OpenAI 兼容接口，多来源可切换（魔搭 / 智谱 / DeepSeek / 硅基 …），解析校验 + 重试 + 超时
- **多币种 + 每日汇率**：自定义币种，自动拉取当日汇率，统计单位可切换
- **统计**：分类饼图、柱状、近 6 月趋势、点分类钻取明细
- **明细**：搜索、按类型/分类(多选)/金额范围筛选、撤销删除
- **数据**：完整备份（JSON）/ 明细导出（CSV）/ 导入还原，全部本地 localStorage 持久化

## 本地预览

直接用浏览器打开 `index.html` 即可。语音/部分接口建议本地起服务：

```bash
npx serve .
```

## 打包 Android（自动）

推送到 `main` 分支后，GitHub Actions 自动：构建 web → 生成 `android/` → 出图标 → `gradlew assembleDebug` → 把 `coinjot.apk` 发到 **Releases 的 `latest`**。手机下载安装即可。

## 技术

- 纯静态：`index.html` + `css/` + `js/`（多模块，无构建步骤）
- `build-www.js` 把源文件拷进 `www/`，Capacitor 以 `www` 为 webDir
- 插件：`@capacitor/app`(返回键) · `@capacitor/status-bar`(状态栏) · `@capacitor-community/speech-recognition`(语音) · CapacitorHttp(绕过 CORS)

## 隐私

API Key、账目数据均仅存于设备本地（localStorage）。完整备份文件含 Key，请妥善保管，勿公开分享。
