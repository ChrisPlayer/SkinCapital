' SkinCapital - lanceur silencieux.
' Demarre le serveur en arriere-plan puis ouvre le navigateur.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & root & "\node\node.exe"" """ & root & "\app\launcher.cjs""", 0, False
