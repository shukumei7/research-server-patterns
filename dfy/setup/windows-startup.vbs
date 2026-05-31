Set WShell = CreateObject("WScript.Shell")
' Update RS_PATH to match the client's install directory
Const RS_PATH = "C:\research-server"

WShell.Run "cmd /c cd /d " & RS_PATH & " && node server.js >> logs\server.log 2>&1", 0, False
WShell.Run "cmd /c cd /d " & RS_PATH & " && node mcp-server.js >> logs\mcp.log 2>&1", 0, False
WShell.Run "cmd /c cd /d " & RS_PATH & " && node orchestrator.js >> logs\orchestrator.log 2>&1", 0, False
