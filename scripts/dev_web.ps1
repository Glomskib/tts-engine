# dev_web.ps1 - Start Next.js dev server from repo root
# PowerShell 5.1 compatible

$ErrorActionPreference = "Continue"

# Check if npm is resolvable; if not, try adding Node.js to PATH
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    if (-not ($env:Path -match 'nodejs')) {
        $env:Path = "C:\Program Files\nodejs;$env:Path"
    }
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) {
        Write-Error "npm not found. Install Node.js or add it to PATH."
        exit 1
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "web"

if (-not (Test-Path $webDir)) {
    Write-Error "ERROR: web directory not found at $webDir"
    exit 1
}

Write-Host "Checking for processes on port 3000..." -ForegroundColor Yellow
$netstatOutput = netstat -ano 2>$null | findstr ":3000" | findstr "LISTENING"
if ($netstatOutput) {
    $pids = $netstatOutput | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
    foreach ($procId in $pids) {
        if ($procId -match '^\d+$') {
            Write-Host "Stopping process $procId on port 3000" -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

$nextDir = Join-Path $webDir ".next"
if (Test-Path $nextDir) {
    Write-Host "Removing .next cache..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $nextDir -ErrorAction SilentlyContinue
}

Write-Host "Starting dev server in $webDir" -ForegroundColor Cyan
Set-Location $webDir
npm run dev
