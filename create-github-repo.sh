#!/bin/bash

# 时尚饰品入库助手 - GitHub 仓库创建脚本

echo "🚀 创建 GitHub 仓库..."

# 创建 .gitignore 文件（如果不存在）
if [ ! -f .gitignore ]; then
    echo "创建 .gitignore 文件..."
    cat > .gitignore << 'GITIGNORE'
# Dependencies
node_modules/
.pnp
.pnp.js

# Expo
.expo/
dist/
web-build/

# Native
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision

# Metro
.metro-health-check*

# Debug
npm-debug.*
yarn-debug.*
yarn-error.*

# macOS
.DS_Store
*.pem

# Local env files
.env*.local
.env

# Typescript
*.tsbuildinfo

# Logs
*.log

# IDE
.vscode/
.idea/

# Temporary files
*.swp
*.swo
*~
GITIGNORE
fi

# 初始化 Git 仓库
if [ ! -d .git ]; then
    echo "初始化 Git 仓库..."
    git init
    git add .
    git commit -m "Initial commit: 时尚饰品入库助手

- 完整的入库流程（拍照、SKU、AI识别、位置）
- AI 辅助查重功能
- 库存管理和搜索
- 回收站系统
- Excel 导出（店小秘格式）
- 用户认证和操作员记录
- 反馈系统

技术栈：Expo 54 + React Native + TypeScript + OpenAI Vision API"
fi

# 创建 GitHub 仓库
echo "创建 GitHub 仓库..."
gh repo create fashion-accessories-inventory \
    --private \
    --description "时尚饰品入库助手 - 基于 Expo + React Native 的移动端入库管理应用" \
    --source=. \
    --remote=origin \
    --push

echo "✅ GitHub 仓库创建成功！"
echo ""
echo "仓库地址: https://github.com/panshine6/fashion-accessories-inventory"
echo ""
echo "后续操作："
echo "1. 访问仓库页面设置仓库描述和主题"
echo "2. 添加 README.md 文件"
echo "3. 配置 GitHub Actions（可选）"
