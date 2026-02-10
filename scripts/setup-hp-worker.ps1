# =============================================================================
# FlashFlow HP Worker Laptop Setup Script (Windows PowerShell)
# =============================================================================
#
# Run as Administrator:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\setup-hp-worker.ps1
#
# This script sets up an HP laptop as a FlashFlow worker machine for:
#   - TikTok stats scraping (Playwright + Python)
#   - Video rendering/processing
#   - Research scanning
#   - Scheduled automation tasks
#
# Prerequisites: Windows 10/11, internet connection, admin rights
# =============================================================================

param(
    [switch]$SkipPython,
    [switch]$SkipNode,
    [switch]$SkipGit,
    [switch]$DryRun,
    [string]$FlashFlowApiKey = "",
    [string]$MacMiniIP = "192.168.1.210"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# --- Configuration ---
$WORK_DIR = "C:\FlashFlow"
$SCRIPTS_DIR = "$WORK_DIR\scripts"
$LOGS_DIR = "$WORK_DIR\logs"
$CONFIG_DIR = "$WORK_DIR\config"
$VENV_DIR = "$WORK_DIR\.venv"

$PYTHON_VERSION = "3.12"
$NODE_VERSION = "20"
$GIT_REPO = "https://github.com/Glomskib/tts-engine.git"

# --- Logging ---
function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
    Write-Host ""
}

function Write-OK {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Skip {
    param([string]$Message)
    Write-Host "  [SKIP] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
}

function Test-Admin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# --- Pre-flight checks ---
Write-Step "Pre-flight Checks"

if (-not (Test-Admin)) {
    Write-Fail "This script must be run as Administrator"
    Write-Host "  Right-click PowerShell > Run as Administrator" -ForegroundColor Yellow
    exit 1
}
Write-OK "Running as Administrator"

# Check Windows version
$osVersion = [System.Environment]::OSVersion.Version
Write-OK "Windows $($osVersion.Major).$($osVersion.Minor) detected"

# --- Install Chocolatey (package manager) ---
Write-Step "Installing Chocolatey Package Manager"

if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-OK "Chocolatey already installed"
} elseif ($DryRun) {
    Write-Skip "Would install Chocolatey (dry run)"
} else {
    try {
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Write-OK "Chocolatey installed"
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    } catch {
        Write-Fail "Could not install Chocolatey: $_"
        exit 1
    }
}

# --- Install Python ---
Write-Step "Installing Python $PYTHON_VERSION"

if ($SkipPython) {
    Write-Skip "Python installation skipped (flag)"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pyVer = python --version 2>&1
    Write-OK "Python already installed: $pyVer"
} elseif ($DryRun) {
    Write-Skip "Would install Python $PYTHON_VERSION (dry run)"
} else {
    choco install python --version=$PYTHON_VERSION -y
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-OK "Python $PYTHON_VERSION installed"
}

# --- Install Node.js ---
Write-Step "Installing Node.js $NODE_VERSION"

if ($SkipNode) {
    Write-Skip "Node.js installation skipped (flag)"
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = node --version 2>&1
    Write-OK "Node.js already installed: $nodeVer"
} elseif ($DryRun) {
    Write-Skip "Would install Node.js $NODE_VERSION (dry run)"
} else {
    choco install nodejs-lts -y
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-OK "Node.js installed"
}

# --- Install Git ---
Write-Step "Installing Git"

if ($SkipGit) {
    Write-Skip "Git installation skipped (flag)"
} elseif (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVer = git --version 2>&1
    Write-OK "Git already installed: $gitVer"
} elseif ($DryRun) {
    Write-Skip "Would install Git (dry run)"
} else {
    choco install git -y
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-OK "Git installed"
}

# --- Create directory structure ---
Write-Step "Creating Directory Structure"

$dirs = @($WORK_DIR, $SCRIPTS_DIR, $LOGS_DIR, $CONFIG_DIR)
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        if ($DryRun) {
            Write-Skip "Would create $dir"
        } else {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-OK "Created $dir"
        }
    } else {
        Write-OK "$dir exists"
    }
}

# --- Clone repository ---
Write-Step "Cloning FlashFlow Repository"

$repoDir = "$WORK_DIR\tts-engine"
if (Test-Path "$repoDir\.git") {
    Write-OK "Repository already cloned"
    if (-not $DryRun) {
        Push-Location $repoDir
        git pull origin master 2>&1
        Pop-Location
        Write-OK "Pulled latest changes"
    }
} elseif ($DryRun) {
    Write-Skip "Would clone $GIT_REPO"
} else {
    git clone $GIT_REPO $repoDir 2>&1
    Write-OK "Repository cloned to $repoDir"
}

# --- Copy scripts ---
Write-Step "Copying Automation Scripts"

if (Test-Path "$repoDir\scripts") {
    if (-not $DryRun) {
        Copy-Item "$repoDir\scripts\*.py" $SCRIPTS_DIR -Force
        Copy-Item "$repoDir\scripts\requirements-*.txt" $SCRIPTS_DIR -Force
        Write-OK "Scripts copied to $SCRIPTS_DIR"
    } else {
        Write-Skip "Would copy scripts (dry run)"
    }
} else {
    Write-Skip "No scripts directory in repo yet"
}

# --- Set up Python virtual environment ---
Write-Step "Setting Up Python Virtual Environment"

if ($SkipPython) {
    Write-Skip "Python venv skipped (flag)"
} elseif ($DryRun) {
    Write-Skip "Would create venv (dry run)"
} else {
    if (-not (Test-Path $VENV_DIR)) {
        python -m venv $VENV_DIR
        Write-OK "Virtual environment created at $VENV_DIR"
    } else {
        Write-OK "Virtual environment exists"
    }

    # Activate and install dependencies
    & "$VENV_DIR\Scripts\Activate.ps1"

    # Install all requirements files
    $reqFiles = Get-ChildItem "$SCRIPTS_DIR\requirements-*.txt" -ErrorAction SilentlyContinue
    foreach ($req in $reqFiles) {
        Write-Host "  Installing from $($req.Name)..." -ForegroundColor Gray
        pip install -r $req.FullName 2>&1 | Out-Null
    }
    Write-OK "Python dependencies installed"

    # Install Playwright browsers
    Write-Host "  Installing Playwright browsers (this may take a few minutes)..." -ForegroundColor Gray
    python -m playwright install chromium 2>&1 | Out-Null
    Write-OK "Playwright Chromium installed"
}

# --- Generate config files ---
Write-Step "Generating Configuration Files"

$apiKey = $FlashFlowApiKey
if (-not $apiKey) {
    Write-Host "  Enter your FlashFlow API key (ff_ak_...):" -ForegroundColor Yellow
    $apiKey = Read-Host "  API Key"
}

if ($apiKey -and -not $DryRun) {
    # TikTok scraper config
    $tiktokConfig = @{
        flashflow_api_url = "https://web-pied-delta-30.vercel.app/api"
        flashflow_api_key = $apiKey
        scrape_interval_hours = 6
        delay_between_scrapes = 3
    } | ConvertTo-Json -Depth 3

    Set-Content "$CONFIG_DIR\tiktok-scraper-config.json" $tiktokConfig
    Write-OK "TikTok scraper config created"

    # Research scanner config
    $researchConfig = @{
        flashflow_api_url = "https://web-pied-delta-30.vercel.app/api"
        flashflow_api_key = $apiKey
        scan_interval_hours = 4
        posts_per_subreddit = 25
        min_upvotes = 5
    } | ConvertTo-Json -Depth 3

    Set-Content "$CONFIG_DIR\research-scanner-config.json" $researchConfig
    Write-OK "Research scanner config created"
} elseif ($DryRun) {
    Write-Skip "Would generate configs (dry run)"
} else {
    Write-Skip "No API key provided — configs not generated"
}

# --- Set up scheduled tasks ---
Write-Step "Setting Up Scheduled Tasks"

if ($DryRun) {
    Write-Skip "Would create scheduled tasks (dry run)"
} else {
    $pythonExe = "$VENV_DIR\Scripts\python.exe"

    # TikTok Stats Scraper — every 6 hours
    $action1 = New-ScheduledTaskAction -Execute $pythonExe -Argument "$SCRIPTS_DIR\tiktok-scraper.py" -WorkingDirectory $SCRIPTS_DIR
    $trigger1 = New-ScheduledTaskTrigger -Once -At "3:00AM" -RepetitionInterval (New-TimeSpan -Hours 6)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName "FlashFlow-TikTokScraper" -Action $action1 -Trigger $trigger1 -Settings $settings -Description "Scrape TikTok stats for FlashFlow videos" -Force
    Write-OK "TikTok Scraper scheduled (every 6 hours)"

    # Research Scanner — every 4 hours
    $action2 = New-ScheduledTaskAction -Execute $pythonExe -Argument "$SCRIPTS_DIR\research-scanner.py" -WorkingDirectory $SCRIPTS_DIR
    $trigger2 = New-ScheduledTaskTrigger -Once -At "1:00AM" -RepetitionInterval (New-TimeSpan -Hours 4)
    Register-ScheduledTask -TaskName "FlashFlow-ResearchScanner" -Action $action2 -Trigger $trigger2 -Settings $settings -Description "Scan Reddit for trending products" -Force
    Write-OK "Research Scanner scheduled (every 4 hours)"
}

# --- Enable SSH for remote management ---
Write-Step "Enabling SSH Server"

if ($DryRun) {
    Write-Skip "Would enable SSH (dry run)"
} else {
    $sshCapability = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
    if ($sshCapability.State -eq 'Installed') {
        Write-OK "OpenSSH Server already installed"
    } else {
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
        Write-OK "OpenSSH Server installed"
    }

    Start-Service sshd -ErrorAction SilentlyContinue
    Set-Service -Name sshd -StartupType Automatic
    Write-OK "SSH service started and set to auto-start"

    # Firewall rule
    $rule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
        Write-OK "Firewall rule added for SSH"
    } else {
        Write-OK "SSH firewall rule exists"
    }
}

# --- Enable Wake-on-LAN ---
Write-Step "Configuring Wake-on-LAN"

if ($DryRun) {
    Write-Skip "Would configure WoL (dry run)"
} else {
    # Get the primary network adapter
    $adapter = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.InterfaceDescription -notlike "*Virtual*" } | Select-Object -First 1
    if ($adapter) {
        # Enable Wake-on-LAN in adapter settings
        $wolProperties = @("Wake on Magic Packet", "Wake on Pattern Match", "WakeOnMagicPacket")
        foreach ($prop in $wolProperties) {
            try {
                Set-NetAdapterAdvancedProperty -Name $adapter.Name -DisplayName $prop -DisplayValue "Enabled" -ErrorAction SilentlyContinue
            } catch { }
        }
        Write-OK "Wake-on-LAN configured for $($adapter.Name)"
        Write-Host "  MAC Address: $($adapter.MacAddress)" -ForegroundColor Gray
        Write-Host "  Note: Also enable WoL in BIOS/UEFI settings" -ForegroundColor Yellow
    } else {
        Write-Fail "No active network adapter found for WoL"
    }
}

# --- Configure power settings ---
Write-Step "Configuring Power Settings"

if ($DryRun) {
    Write-Skip "Would configure power (dry run)"
} else {
    # Prevent sleep when plugged in (so scheduled tasks run)
    powercfg /change standby-timeout-ac 0
    powercfg /change hibernate-timeout-ac 0
    Write-OK "Sleep disabled when on AC power"

    # Allow sleep on battery
    powercfg /change standby-timeout-dc 15
    Write-OK "Sleep on battery set to 15 minutes"
}

# --- Create connectivity test script ---
Write-Step "Creating Connectivity Test"

$testScript = @"
# FlashFlow Worker Connectivity Test
Write-Host "Testing FlashFlow Worker connectivity..." -ForegroundColor Cyan
Write-Host ""

# Test internet
try {
    `$r = Invoke-WebRequest -Uri "https://web-pied-delta-30.vercel.app/api/observability/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "[OK] FlashFlow API reachable (HTTP `$(`$r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] FlashFlow API unreachable" -ForegroundColor Red
}

# Test Mac Mini
try {
    `$ping = Test-Connection -ComputerName "$MacMiniIP" -Count 1 -Quiet
    if (`$ping) {
        Write-Host "[OK] Mac Mini ($MacMiniIP) reachable" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Mac Mini ($MacMiniIP) unreachable" -ForegroundColor Red
    }
} catch {
    Write-Host "[FAIL] Mac Mini ping failed" -ForegroundColor Red
}

# Test Python
try {
    `$py = python --version 2>&1
    Write-Host "[OK] Python: `$py" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Python not found" -ForegroundColor Red
}

# Test scheduled tasks
`$tasks = Get-ScheduledTask -TaskPath "\" | Where-Object { `$_.TaskName -like "FlashFlow-*" }
Write-Host ""
Write-Host "Scheduled Tasks:" -ForegroundColor Cyan
foreach (`$t in `$tasks) {
    Write-Host "  [`$(`$t.State)] `$(`$t.TaskName)" -ForegroundColor Gray
}
"@

if (-not $DryRun) {
    Set-Content "$WORK_DIR\test-connectivity.ps1" $testScript
    Write-OK "Connectivity test script created at $WORK_DIR\test-connectivity.ps1"
}

# --- Summary ---
Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  FlashFlow Worker Setup Complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Work directory:  $WORK_DIR" -ForegroundColor White
Write-Host "  Scripts:         $SCRIPTS_DIR" -ForegroundColor White
Write-Host "  Logs:            $LOGS_DIR" -ForegroundColor White
Write-Host "  Config:          $CONFIG_DIR" -ForegroundColor White
Write-Host "  Python venv:     $VENV_DIR" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Run test: .\test-connectivity.ps1" -ForegroundColor Gray
Write-Host "    2. Enable WoL in BIOS (restart > F2/F10)" -ForegroundColor Gray
Write-Host "    3. Generate SSH key: ssh-keygen -t ed25519" -ForegroundColor Gray
Write-Host "    4. Copy SSH pubkey to Mac Mini:" -ForegroundColor Gray
Write-Host "       scp ~/.ssh/id_ed25519.pub brandon@${MacMiniIP}:~/.ssh/authorized_keys" -ForegroundColor Gray
Write-Host ""
