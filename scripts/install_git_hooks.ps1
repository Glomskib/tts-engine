# install_git_hooks.ps1 - Install pre-commit hook for tts-engine
# PowerShell 5.1 compatible

$ErrorActionPreference = "Stop"

# Verify git exists
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    Write-Error "git not found. Install Git for Windows."
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$hooksDir = Join-Path $repoRoot ".git\hooks"
$preCommitPath = Join-Path $hooksDir "pre-commit"

# Ensure hooks directory exists
if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
}

# Write the pre-commit hook (bash script for Git for Windows)
$hookContent = @'
#!/bin/sh
# Pre-commit hook - calls PowerShell validation script

REPO_ROOT="$(git rev-parse --show-toplevel)"
VALIDATOR="$REPO_ROOT/scripts/precommit_validate.ps1"

if command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -ExecutionPolicy Bypass -File "$VALIDATOR"
    STATUS=$?
elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$VALIDATOR"
    STATUS=$?
else
    echo "ERROR: Neither pwsh nor powershell.exe found in PATH"
    exit 1
fi

if [ $STATUS -eq 0 ]; then
    echo "pre-commit: OK"
fi
exit $STATUS
'@

# Write hook file with LF line endings (required for Git Bash)
$hookContent | Set-Content -Path $preCommitPath -Encoding ASCII -NoNewline
# Re-write with proper newlines
[System.IO.File]::WriteAllText($preCommitPath, $hookContent.Replace("`r`n", "`n"))

# Try to make executable (works in Git Bash environment)
try {
    $gitBash = Join-Path (Split-Path (Get-Command git).Source) "..\bin\bash.exe"
    if (Test-Path $gitBash) {
        & $gitBash -c "chmod +x '$($preCommitPath.Replace('\', '/'))'" 2>$null
    }
} catch {
    # chmod not critical on Windows with Git for Windows
}

Write-Host "Installed pre-commit hook" -ForegroundColor Green
Write-Host "Hook location: $preCommitPath" -ForegroundColor Cyan
