@echo off
cd /d "%~dp0"
git add data/*.json
git diff --cached --quiet data/
if %errorlevel%==0 (
    echo 数据无变化，无需提交。
    pause
    exit /b
)
git commit -m "data: 更新后台数据"
git push
echo 数据已同步到服务器。
pause
