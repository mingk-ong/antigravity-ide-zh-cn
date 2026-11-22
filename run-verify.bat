@echo off
chcp 65001 > nul
title Antigravity IDE 汉化与使用优化状态校验

echo ====================================================
echo   Antigravity IDE 汉化与使用优化全链路状态检验
echo ====================================================
echo.

node "%~dp0src\verifier.js"

echo.
pause
