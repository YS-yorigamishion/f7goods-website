#!/bin/bash
# f7goods 服务器部署脚本
# 用法: bash deploy.sh
# 在服务器的 f7goods 项目目录下运行

set -e
cd "$(dirname "$0")"

echo "=== f7goods deploy ==="

# 1. 备份数据
echo "[1/5] 备份 data/ ..."
cp -r data data.bak 2>/dev/null || true

# 2. 暂存本地代码改动（排除 data 目录）
git stash --include-untracked -- ':(exclude)data' 2>/dev/null || true

# 3. 拉取最新代码（这会删除 data/ 中的文件，因为它们不再被 git 跟踪）
echo "[2/5] git pull ..."
git pull --rebase || git pull

# 4. 恢复数据文件
echo "[3/5] 恢复 data/ ..."
if [ -d "data.bak" ]; then
  for f in data.bak/*.json; do
    [ -f "$f" ] && cp "$f" "data/$(basename $f)"
  done
  rm -rf data.bak
fi

# 5. 初始化缺失的数据文件
echo "[4/5] 检查数据文件 ..."
mkdir -p data
node init-data.js

# 6. 重启服务
echo "[5/5] 重启服务 ..."
if command -v pm2 &> /dev/null; then
  pm2 restart f7goods 2>/dev/null || pm2 start ecosystem.config.js
  echo "PM2 服务已重启"
else
  echo "请手动重启服务 (pm2 restart f7goods)"
fi

echo "=== 部署完成 ==="
