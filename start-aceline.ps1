# Aceline Core Plus Launcher
Write-Host "Starting Aceline Core Plus..." -ForegroundColor Cyan

# Kill any existing servers on ports 8547 and 8548
$backendPort = 8547
$uiPort = 8548

foreach ($port in @($backendPort, $uiPort)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        foreach ($c in $conn) {
            try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
        }
        Write-Host "  Killed existing process on port $port" -ForegroundColor Yellow
    }
}

Start-Sleep -Seconds 2

# Start the backend
Write-Host "  Starting backend (port $backendPort)..." -ForegroundColor Cyan
$backendScript = @"
cd 'C:\Users\hawpe\CascadeProjects\soulmate\inc_llm_v1'
& 'C:\Users\hawpe\.local\bin\python3.11.exe' -m uvicorn inc_llm.server:app --host 0.0.0.0 --port $backendPort
"@
Start-Process -WindowStyle Minimized -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $backendScript

# Wait for backend to be ready (up to 120 seconds)
Write-Host "  Waiting for backend..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Seconds 5
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$backendPort/v1/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $ready = $true
            Write-Host "  Backend is ready!" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "  ...still waiting ($($i * 5)s)" -ForegroundColor DarkGray
    }
}

if (-not $ready) {
    Write-Host "  Backend failed to start within 120 seconds." -ForegroundColor Red
    Write-Host "  Check the minimized 'powershell' window for errors." -ForegroundColor Yellow
    pause
    exit 1
}

# Start the UI server
Write-Host "  Starting UI server (port $uiPort)..." -ForegroundColor Cyan
$uiScript = @"
cd 'C:\Users\hawpe\CascadeProjects\soulmate\aceline-ui'
& 'C:\Users\hawpe\.local\bin\python3.11.exe' -m http.server $uiPort
"@
Start-Process -WindowStyle Minimized -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $uiScript

Start-Sleep -Seconds 3

# Open the browser
Write-Host "  Opening browser..." -ForegroundColor Cyan
Start-Process "http://127.0.0.1:$uiPort/index.html"

Write-Host ""
Write-Host "Aceline Core Plus is running!" -ForegroundColor Green
Write-Host "  Backend: http://localhost:$backendPort" -ForegroundColor Gray
Write-Host "  UI: http://127.0.0.1:$uiPort/index.html" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop: close the two minimized PowerShell windows." -ForegroundColor Yellow
Write-Host ""
