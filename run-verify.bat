@echo off
chcp 65001 > nul
title Antigravity IDE 汉化生效与防损坏状态校验

echo ====================================================
echo   Antigravity IDE 汉化生效与防损坏状态全量检验
echo ====================================================
echo.

node "%~dp0src\verifier.js"

echo.
pause
