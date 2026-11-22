@echo off
chcp 65001 >nul
title Antigravity IDE 汉化工具
echo 正在运行 Antigravity Settings 界面汉化...
node "%~dp0src\patcher.js"
echo.
pause
