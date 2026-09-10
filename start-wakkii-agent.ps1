$ErrorActionPreference = "SilentlyContinue"
$py = "C:\Users\hawpe\AppData\Roaming\uv\python\cpython-3.11.15-windows-x86_64-none\python.exe"
if (-not (Test-Path $py)) { $py = "python" }

Start-Process -FilePath $py -ArgumentList "C:\Users\hawpe\CascadeProjects\soulmate\wakkii_chat_server.py" -WindowStyle Hidden
Start-Sleep -Seconds 2

$env:WAKKII_API = "http://127.0.0.1:8085"
$env:WINDSURF_API = "http://127.0.0.1:3003"
$env:WINDSURF_KEY = "local-dev-key-openmausbot"
$env:WINDSURF_MODEL = "glm-5.1"
$env:WAKKII_ROOM = "AGENT"

Start-Process -FilePath $py -ArgumentList "C:\Users\hawpe\CascadeProjects\soulmate\wakkii_agent.py" -WindowStyle Hidden
