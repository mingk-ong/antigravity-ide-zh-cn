# Antigravity IDE 多渠道随程自启与快捷方式部署脚本
param(
    [switch]$IncludeWatcher
)

$PATCH_DIR = $PSScriptRoot
$APP_DIR = if ($env:ANTIGRAVITY_IDE_DIR) { $env:ANTIGRAVITY_IDE_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\Antigravity IDE" }
$APP_EXE = Join-Path $APP_DIR "Antigravity IDE.exe"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$NODE_EXE = if ($nodeCmd) { $nodeCmd.Source } else { "node.exe" }

$STARTUP_DIR = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$STARTUP_VBS = Join-Path $STARTUP_DIR "AntigravityUpdateWatcher.vbs"
$WATCHER_JS = "$PATCH_DIR\src\antigravity_watcher.js"
$LAUNCHER_VBS = "$PATCH_DIR\src\antigravity_launcher.vbs"

$TASKBAR_LNK = "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Antigravity IDE.lnk"
$STARTMENU_LNK = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Antigravity\Antigravity IDE.lnk"
$DESKTOP_DIR = "$env:USERPROFILE\OneDrive\Desktop"
if (-not (Test-Path $DESKTOP_DIR)) { $DESKTOP_DIR = "$env:USERPROFILE\Desktop" }
$DESKTOP_LNK = Join-Path $DESKTOP_DIR "Antigravity IDE.lnk"

Write-Output "=========================================================="
Write-Output "  Antigravity IDE 多渠道快捷方式与自愈启动配置"
Write-Output "  项目目录: $PATCH_DIR"
Write-Output "  IDE 目录: $APP_DIR"
Write-Output "=========================================================="

if ($IncludeWatcher) {
    $vbsContent = "Set ws = CreateObject(`"Wscript.Shell`")`r`nws.Run `"`"`"$NODE_EXE`"`" `"`"$WATCHER_JS`"`"`", 0, False"
    [System.IO.File]::WriteAllText($STARTUP_VBS, $vbsContent, [System.Text.Encoding]::Unicode)
    Write-Output "✔ [渠道 1] 开机后台守望者已挂载至 Startup 启动项"
} else {
    Write-Output "- [跳过] 未启用 Startup 后台守望进程（如需挂载请加 -IncludeWatcher）"
}

$sh = New-Object -ComObject WScript.Shell
$targets = @(
    @{ Name = "任务栏"; Path = $TASKBAR_LNK },
    @{ Name = "开始菜单"; Path = $STARTMENU_LNK },
    @{ Name = "桌面"; Path = $DESKTOP_LNK }
)

foreach ($t in $targets) {
    if (Test-Path $t.Path) {
        $s = $sh.CreateShortcut($t.Path)
        $s.TargetPath = "wscript.exe"
        $s.Arguments = "`"$LAUNCHER_VBS`""
        $s.WorkingDirectory = $APP_DIR
        $s.IconLocation = "$APP_EXE,0"
        $s.Description = "Google Antigravity IDE (带全自动更新检测与自愈汉化)"
        $s.Save()
        Write-Output "✔ [$($t.Name)] 快捷方式升级完成: $($t.Path)"
    } else {
        Write-Output "- [$($t.Name)] 快捷方式不存在，跳过: $($t.Path)"
    }
}

Write-Output "=========================================================="
Write-Output "🎉 快捷方式同步完成！"
Write-Output "=========================================================="
