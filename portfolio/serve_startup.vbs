' Launches serve.py silently at Windows boot (no cmd window).
' Put a shortcut to THIS file in:
'   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

Dim folder
folder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

CreateObject("WScript.Shell").Run _
    "python """ & folder & "\serve.py""", _
    0, False   ' 0 = hidden window, False = don't wait
