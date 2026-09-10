$ErrorActionPreference = "SilentlyContinue"
Start-Process -FilePath "C:\Users\hawpe\picoclaw\cloudflared.exe" -ArgumentList "tunnel","--url","http://127.0.0.1:8085" -WindowStyle Hidden
