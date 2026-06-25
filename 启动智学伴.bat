@echo off
chcp 65001 >nul
title 知学伴 - 启动中...

cd /d "%~dp0"

echo ==============================
echo   知学伴 - 正在启动服务...
echo   请稍候，浏览器将自动打开
echo ==============================

start http://localhost:3000
call npm run dev

pause
