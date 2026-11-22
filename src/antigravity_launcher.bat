@echo off
chcp 65001 >nul
title Antigravity IDE 启动自检与自愈运行器

set "SCRIPT_DIR=%~dp0"
node "%SCRIPT_DIR%auto_updater.js" --launch %*

if %errorlevel% neq 0 (
    echo.
    echo ⚠ 启动或自检出现异常，请查看日志文件:
    echo %USERPROFILE%\.antigravity-zh-cn\logs\antigravity_auto_patch.log
    pause
)
