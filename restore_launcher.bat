@echo off
chcp 65001 >nul
title 还原 Antigravity IDE 官方原生启动快捷方式

echo ========================================================
echo    Antigravity IDE 官方原生启动快捷方式还原向导
echo ========================================================
echo.

set "DESKTOP_DIR=%USERPROFILE%\OneDrive\Desktop"
if not exist "%DESKTOP_DIR%" set "DESKTOP_DIR=%USERPROFILE%\Desktop"

set "APP_DIR=%ANTIGRAVITY_IDE_DIR%"
if "%APP_DIR%"=="" set "APP_DIR=%LOCALAPPDATA%\Programs\Antigravity IDE"

set "TARGET_LNK=%DESKTOP_DIR%\Antigravity IDE.lnk"
set "BACKUP_LNK=%DESKTOP_DIR%\Antigravity IDE (原生备份).lnk"
set "APP_EXE=%APP_DIR%\Antigravity IDE.exe"

if exist "%BACKUP_LNK%" (
    echo 正在从备份恢复官方原生快捷方式...
    copy /y "%BACKUP_LNK%" "%TARGET_LNK%" >nul
    del /f /q "%BACKUP_LNK%" >nul
    echo ✔ 已成功恢复原生快捷方式！
) else (
    echo 正在重新创建指向官方 Antigravity IDE.exe 的原生快捷方式...
    powershell -NoProfile -Command ^
        "$sh = New-Object -ComObject WScript.Shell; " ^
        "$s = $sh.CreateShortcut('%TARGET_LNK%'); " ^
        "$s.TargetPath = '%APP_EXE%'; " ^
        "$s.WorkingDirectory = '%APP_DIR%'; " ^
        "$s.IconLocation = '%APP_EXE%,0'; " ^
        "$s.Save();"
    echo ✔ 原生快捷方式已重建完成！
)

echo.
echo ========================================================
echo 🎉 快捷方式已成功还原为官方原生直连启动模式！
echo ========================================================
echo.
pause
