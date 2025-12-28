#!/bin/bash

# 获取当前版本号
CURRENT_VERSION=$(grep '"version":' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')

# 分割版本号
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

# 增加 patch 版本号
PATCH=$((PATCH + 1))

# 新版本号
NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# 获取当前时间戳和 Git commit hash
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_INFO="$TIMESTAMP-$COMMIT_HASH"

# 更新 package.json
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json

# 更新 app.config.ts
sed -i "s/version: \".*\"/version: \"$NEW_VERSION\"/" app.config.ts

# 更新 lib/version.ts（包含 build 信息）
cat > lib/version.ts << VEOF
/**
 * 应用版本信息
 * 每次修改后自动更新版本号
 */
export const APP_VERSION = "$NEW_VERSION";
export const APP_BUILD = "$BUILD_INFO";
export const APP_AUTHOR = "潘章杰（By Manus）";
VEOF

# 输出新版本号
echo "✅ Version bumped: $CURRENT_VERSION -> $NEW_VERSION"
echo "📦 Build: $BUILD_INFO"
echo ""
echo "🎯 请在应用中显示: v$NEW_VERSION (build $BUILD_INFO)"
