' Starts the Yoto Local companion without a console window.
' Output (including the pairing code) is written to companion.log next to this file.
' Stop it with the Stop companion button in the app.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c npm start > companion.log 2>&1", 0, False
