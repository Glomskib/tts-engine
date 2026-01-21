# precommit_validate.ps1 - Pre-commit validation for tts-engine
# PowerShell 5.1 compatible
# Must run fast (<2s)

$ErrorActionPreference = "Stop"
$failed = $false

# Get list of staged files
$stagedFiles = git diff --cached --name-only 2>$null
if (-not $stagedFiles) {
    exit 0
}

# Check 1: CONTRIBUTING.md fence balance and merged-lines corruption
if ($stagedFiles -match "CONTRIBUTING\.md") {
    $content = git show ":CONTRIBUTING.md" 2>$null
    if ($content) {
        # Count triple backticks (must be even)
        $fenceCount = ([regex]::Matches($content, '```')).Count
        if ($fenceCount % 2 -ne 0) {
            Write-Host "ERROR: CONTRIBUTING.md has unbalanced triple backtick fences ($fenceCount found)" -ForegroundColor Red
            $failed = $true
        }
        
        # Check for merged-lines corruption (## Verification and cd on same line)
        if ($content -match '## Verification.*cd C:\\Users' -or $content -match 'cd C:\\Users.*## Verification') {
            Write-Host "ERROR: CONTRIBUTING.md has merged-lines corruption (newline collapse detected)" -ForegroundColor Red
            $failed = $true
        }
    }
}

# Check 2: .ps1 files should have CRLF (reject LF-only)
$stagedPs1 = $stagedFiles | Where-Object { $_ -match '\.ps1$' }
foreach ($file in $stagedPs1) {
    $bytes = git show ":$file" 2>$null | Out-String
    if ($bytes) {
        # Check for LF without preceding CR (simplified heuristic)
        $hasLfOnly = $bytes -match "`n" -and $bytes -notmatch "`r`n"
        if ($hasLfOnly -and $bytes.Length -gt 10) {
            # More precise: count line endings
            $crlfCount = ([regex]::Matches($bytes, "`r`n")).Count
            $lfCount = ([regex]::Matches($bytes, "(?<!`r)`n")).Count
            if ($lfCount -gt $crlfCount -and $lfCount -gt 2) {
                Write-Host "ERROR: $file has LF-only line endings (should be CRLF for .ps1)" -ForegroundColor Red
                $failed = $true
            }
        }
    }
}

# Check 3: .md files should have LF (reject CRLF)
$stagedMd = $stagedFiles | Where-Object { $_ -match '\.md$' }
foreach ($file in $stagedMd) {
    $bytes = git show ":$file" 2>$null | Out-String
    if ($bytes -and $bytes.Length -gt 10) {
        $crlfCount = ([regex]::Matches($bytes, "`r`n")).Count
        if ($crlfCount -gt 5) {
            Write-Host "WARNING: $file has CRLF line endings (should be LF for .md)" -ForegroundColor Yellow
            # Warning only, not blocking
        }
    }
}

# Check 4: Large replacement detection (soft heuristic for overwrites)
$diffStat = git diff --cached --numstat 2>$null
foreach ($line in $diffStat) {
    if ($line -match '^(\d+)\s+(\d+)\s+(.+)$') {
        $added = [int]$Matches[1]
        $deleted = [int]$Matches[2]
        $filepath = $Matches[3]
        
        if ($added -gt 300 -and $deleted -gt 300) {
            Write-Host "ERROR: Large replacement detected in $filepath (+$added/-$deleted lines)" -ForegroundColor Red
            Write-Host "       Use patch-only workflow. If intentional, use 'git commit --no-verify'" -ForegroundColor Yellow
            $failed = $true
        }
    }
}

if ($failed) {
    Write-Host "`nPre-commit validation FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "Pre-commit validation passed" -ForegroundColor Green
exit 0
