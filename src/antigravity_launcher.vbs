Option Explicit
On Error Resume Next

Dim ws, fso, scriptDir, nodeExe, updaterJs, ideDir, ideExe, cmd, argsStr, i, launched

Set ws = WScript.CreateObject("WScript.Shell")
Set fso = WScript.CreateObject("Scripting.FileSystemObject")

Function FindNodeExe()
    Dim envNode, pathEnv, dirs, d, candidate
    envNode = ws.ExpandEnvironmentStrings("%NODE_EXE%")
    If envNode <> "" And envNode <> "%NODE_EXE%" And fso.FileExists(envNode) Then
        FindNodeExe = envNode
        Exit Function
    End If

    pathEnv = ws.ExpandEnvironmentStrings("%PATH%")
    dirs = Split(pathEnv, ";")
    For Each d In dirs
        d = Trim(d)
        If d <> "" Then
            If Right(d, 1) = "\" Then d = Left(d, Len(d) - 1)
            candidate = d & "\node.exe"
            If fso.FileExists(candidate) Then
                FindNodeExe = candidate
                Exit Function
            End If
        End If
    Next

    candidate = ws.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
    If fso.FileExists(candidate) Then
        FindNodeExe = candidate
        Exit Function
    End If
    FindNodeExe = ""
End Function

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
nodeExe = FindNodeExe()
updaterJs = scriptDir & "\auto_updater.js"

ideDir = ws.ExpandEnvironmentStrings("%ANTIGRAVITY_IDE_DIR%")
If ideDir = "" Or ideDir = "%ANTIGRAVITY_IDE_DIR%" Then
    ideDir = ws.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Antigravity IDE"
End If
ideExe = ideDir & "\Antigravity IDE.exe"

argsStr = ""
For i = 0 To WScript.Arguments.Count - 1
    argsStr = argsStr & " """ & WScript.Arguments(i) & """"
Next

launched = False
If nodeExe <> "" And fso.FileExists(updaterJs) Then
    cmd = """" & nodeExe & """ """ & updaterJs & """ --launch" & argsStr
    ws.Run cmd, 0, False
    If Err.Number = 0 Then
        launched = True
    End If
End If

If Not launched Then
    Err.Clear
    If fso.FileExists(ideExe) Then
        cmd = """" & ideExe & """" & argsStr
        ws.Run cmd, 1, False
    End If
End If

Set ws = Nothing
Set fso = Nothing
