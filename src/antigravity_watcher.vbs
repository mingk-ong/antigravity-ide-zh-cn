Option Explicit
On Error Resume Next

Dim ws, fso, scriptDir, nodeExe, watcherJs

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
watcherJs = scriptDir & "\antigravity_watcher.js"

If nodeExe <> "" And fso.FileExists(watcherJs) Then
    ws.Run """" & nodeExe & """ """ & watcherJs & """", 0, False
End If

Set ws = Nothing
Set fso = Nothing
