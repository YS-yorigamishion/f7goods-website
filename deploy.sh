#!/bin/bash
# f7goods 部署脚本
# 用法: bash deploy.sh
# 功能: 拉取最新代码，保护 data/ 目录不被覆盖，重启服务

set -e

echo "=== f7goods deploy ==="

# 1. 备份数据
echo "[1/4] 备份 data/ ..."
cp -r data data.bak 2>/dev/null || true

# 2. 暂存本地数据文件（告诉 git 不要动它们）
for f in data/*.json; do
  [ -f "$f" ] && git update-index --skip-worktree "$f" 2>/dev/null || true
done

# 3. 拉取最新代码
echo "[2/4] git pull ..."
git stash --include-untracked 2>/dev/null || true
git pull --rebase

# 4. 恢复数据（以防万一）
echo "[3/4] 恢复 data/ ..."
for f in data.bak/*.json; do
  [ -f "$f" ] && cp "$f" "data/$(basename $f)"
done
rm -rf data.bak

# 5. 初始化缺失的数据文件
node init-data.js

# 6. 重启服务
echo "[4/4] 重启服务 ..."
if command -v pm2 &> /dev/null; then
  pm2 restart f7goods || pm2 start ecosystem.config.js
elif command -v docker &> /dev/null; then
  docker compose up -d --build
else
  echo "请手动重启服务"
fi

echo "=== 部署完成 ==="
