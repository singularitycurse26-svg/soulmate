# Universal Ramm1 Installer — Windows PowerShell
# Installs the RAMM1 OS as the Universal LLM Free System with the 3.5 GB RAM lock.
#
# Usage:
#   .\install.ps1              — install
#   .\install.ps1 -Uninstall   — uninstall
#   .\install.ps1 -Status      — check status
#   .\install.ps1 -Repair      — repair
#   .\install.ps1 -Verify      — verify installation

param(
    [switch]$Uninstall,
    [switch]$Status,
    [switch]$Repair,
    [switch]$Verify
)

$ErrorActionPreference = "Stop"
$ProjectDir = "C:\Users\hawpe\CascadeProjects\soulmate\inc_llm_v1"
$Python = "py -V:Astral/CPython3.11.15"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Universal Ramm1 Installer" -ForegroundColor Cyan
Write-Host " RAMM1 OS + Universal LLM Free System" -ForegroundColor Cyan
Write-Host " 3.5 GB RAM Lock" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($Status) {
    Write-Host "Checking installation status..." -ForegroundColor Yellow
    & $Python -c "import sys; sys.path.insert(0, '$ProjectDir'); from inc_llm.ramm1.install import Ramm1Installer; import json; print(json.dumps(Ramm1Installer().status(), indent=2))"
    exit 0
}

if ($Verify) {
    Write-Host "Verifying installation..." -ForegroundColor Yellow
    & $Python -c "import sys; sys.path.insert(0, '$ProjectDir'); from inc_llm.ramm1.install import Ramm1Installer; import json; print(json.dumps(Ramm1Installer().verify(), indent=2))"
    exit 0
}

if ($Uninstall) {
    Write-Host "Uninstalling Universal Ramm1..." -ForegroundColor Yellow
    & $Python -c "import sys; sys.path.insert(0, '$ProjectDir'); from inc_llm.ramm1.install import Ramm1Installer; import json; r = Ramm1Installer().uninstall(); print(json.dumps(r.to_dict(), indent=2))"
    Write-Host "Uninstall complete." -ForegroundColor Green
    exit 0
}

if ($Repair) {
    Write-Host "Repairing Universal Ramm1..." -ForegroundColor Yellow
    & $Python -c "import sys; sys.path.insert(0, '$ProjectDir'); from inc_llm.ramm1.install import Ramm1Installer; import json; r = Ramm1Installer().repair(); print(json.dumps(r.to_dict(), indent=2))"
    Write-Host "Repair complete." -ForegroundColor Green
    exit 0
}

# Install
Write-Host "Installing Universal Ramm1..." -ForegroundColor Yellow
Write-Host "  Project: $ProjectDir"
Write-Host "  Python: $Python"
Write-Host ""

& $Python -c "import sys; sys.path.insert(0, '$ProjectDir'); from inc_llm.ramm1.install import Ramm1Installer; import json; r = Ramm1Installer().install(); print(json.dumps(r.to_dict(), indent=2)); sys.exit(0 if r.success else 1)"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host " Installation Successful!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "The Universal LLM Free System is installed." -ForegroundColor White
    Write-Host "The RAMM1 OS resource layer is active with the 3.5 GB RAM lock." -ForegroundColor White
    Write-Host ""
    Write-Host "API: http://localhost:8547/v1/ramm1/status" -ForegroundColor Cyan
    Write-Host "CLI: ramm1 status" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To start the server:" -ForegroundColor Yellow
    Write-Host "  cd $ProjectDir" -ForegroundColor White
    Write-Host "  $Python -m inc_llm.server" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host " Installation Failed!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Check the output above for errors." -ForegroundColor Yellow
    exit 1
}
