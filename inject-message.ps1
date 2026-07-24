param([Parameter(Mandatory=$true)][string]$Message)

# Find and activate Windsurf (Devin.exe) window
$windsurf = Get-Process "Devin" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1

if (-not $windsurf) {
    Write-Host "Windsurf not running, launching..."
    Start-Process "C:\Users\hawpe\AppData\Local\Programs\Devin\Devin.exe" "C:\Users\hawpe\CascadeProjects\soulmate"
    Start-Sleep -Seconds 8
    $windsurf = Get-Process "Devin" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
}

if (-not $windsurf) {
    Write-Error "Could not find or launch Windsurf"
    exit 1
}

# Activate the window
Add-Type -AssemblyName Microsoft.VisualBasic
[Microsoft.VisualBasic.Interaction]::AppActivate($windsurf.Id)
Start-Sleep -Milliseconds 800

# Copy message to clipboard
Set-Clipboard -Value $Message
Start-Sleep -Milliseconds 300

# Send keystrokes to paste and send
Add-Type -AssemblyName System.Windows.Forms

# Try Ctrl+Shift+I to focus Cascade panel (Windsurf shortcut)
[System.Windows.Forms.SendKeys]::SendWait("^+i")
Start-Sleep -Milliseconds 600

# Paste the message
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 400

# Press Enter to send
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

Write-Host "Message injected successfully"
