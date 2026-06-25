@echo off
chcp 65001 >nul
title 智学伴 - 生产模式

cd /d "%~dp0"

echo ==============================
echo   智学伴 - 编译中...
echo ==============================
call npm run build

echo.
echo ==============================
echo   编译完成，启动服务...
echo   浏览器即将打开
echo ==============================

start http://localhost:3456
call npm run start -- -p 3456

pause
