@echo off
chcp 65001 >nul
title Antigravity IDE 还原官方原版工具
echo 正在还原官方原版英文核心文件...
node "%~dp0src\restore.js"
echo.
pause
