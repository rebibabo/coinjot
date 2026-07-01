#!/usr/bin/env bash
# 用法: ./release.sh "更新说明"
# 自动升 versionCode+1、versionName patch+1，更新 update.js + version.json，提交推送
set -e

NOTES="${1:?用法: ./release.sh \"更新说明\"}"

# ── 读取当前版本 ──────────────────────────────────────────────
CURRENT=$(grep -o "code: [0-9]*" js/update.js | grep -o "[0-9]*")
NAME=$(grep -o "name: '[^']*'" js/update.js | grep -o "'[^']*'" | tr -d "'")

NEW_CODE=$((CURRENT + 1))

# patch +1：1.0.6 → 1.0.7
MAJOR=$(echo "$NAME" | cut -d. -f1)
MINOR=$(echo "$NAME" | cut -d. -f2)
PATCH=$(echo "$NAME" | cut -d. -f3)
NEW_NAME="$MAJOR.$MINOR.$((PATCH + 1))"

echo "版本: v$NAME (code $CURRENT)  →  v$NEW_NAME (code $NEW_CODE)"

# ── 更新 js/update.js ────────────────────────────────────────
sed -i '' "s/const APP_VERSION = { code: $CURRENT, name: '$NAME' };/const APP_VERSION = { code: $NEW_CODE, name: '$NEW_NAME' };/" js/update.js

# ── 更新 version.json ────────────────────────────────────────
cat > version.json <<JSON
{
  "versionCode": $NEW_CODE,
  "versionName": "$NEW_NAME",
  "apkUrl": "https://gitee.com/yuan-zhongsheng/coinjot/releases/download/latest/coinjot.apk",
  "notes": "$NOTES"
}
JSON

# ── 提交推送 ─────────────────────────────────────────────────
git add js/update.js version.json
git commit -m "release: $NEW_NAME — $NOTES [release]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main

echo "✓ v$NEW_NAME (code $NEW_CODE) 已推送，CI 构建中…"
