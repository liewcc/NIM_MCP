[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

$workDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $workDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  NIM MCP -- Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ── 1. config.json ─────────────────────────────────────────────
Write-Host "`n[1/6] Config file..." -ForegroundColor Yellow
$configPath = Join-Path $workDir "config.json"
if (-not (Test-Path $configPath)) {
    $defaultConfig = [ordered]@{ default_model = "z-ai/glm-5.2"; active_tab = "api"; api_key = "" }
    ($defaultConfig | ConvertTo-Json) | Set-Content -Path $configPath -Encoding utf8
    Write-Host "  Created default config.json." -ForegroundColor Green
} else {
    Write-Host "  config.json already exists, leaving it untouched." -ForegroundColor Green
}

# ── 2. Check Python ───────────────────────────────────────────
Write-Host "`n[2/6] Checking Python..." -ForegroundColor Yellow
try {
    $pyVer = & python --version 2>&1
    Write-Host "  Found: $pyVer" -ForegroundColor Green
} catch {
    Write-Error "Python not found. Install Python 3.10+ from https://python.org"
    Read-Host "Press Enter to exit"; exit 1
}

# ── 2. Python venv (MCP server deps) ──────────────────────────
Write-Host "`n[3/6] Python venv (mcp server deps)..." -ForegroundColor Yellow
$venv = Join-Path $workDir ".venv"
if (-not (Test-Path $venv)) {
    & python -m venv $venv
}
& "$venv\Scripts\python.exe" -m pip install -r "requirements.txt" --quiet
if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed"; Read-Host; exit 1 }
Write-Host "  Done." -ForegroundColor Green

# ── 3. Portable Node.js ───────────────────────────────────────
Write-Host "`n[4/6] Portable Node.js..." -ForegroundColor Yellow
$nodeDir = Join-Path $workDir ".node_venv"
$nodeUrl = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip"
$nodeZip = Join-Path $workDir "node-portable.zip"

if (-not (Test-Path $nodeDir)) {
    Write-Host "  Downloading Node.js v20.11.1..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UserAgent "Mozilla/5.0" -UseBasicParsing
        $tempDir = Join-Path $workDir ".node_temp"
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        Expand-Archive -Path $nodeZip -DestinationPath $tempDir -Force
        $inner = Get-ChildItem -Path $tempDir -Directory | Select-Object -First 1
        Move-Item -Path $inner.FullName -Destination $nodeDir -Force
        Remove-Item $nodeZip -Force
        Remove-Item $tempDir -Recurse -Force
        Write-Host "  Node.js extracted to .node_venv" -ForegroundColor Green
    } catch {
        if (Test-Path $nodeZip) { Remove-Item $nodeZip -Force }
        Write-Error "Failed to download Node.js: $_"; Read-Host; exit 1
    }
} else {
    Write-Host "  .node_venv already exists, skipping download." -ForegroundColor Green
}

$env:PATH = "$nodeDir;" + $env:PATH
$nodeVer = & "$nodeDir\node.exe" --version
$npmVer  = & "$nodeDir\npm.cmd" --version
Write-Host "  node $nodeVer  /  npm $npmVer" -ForegroundColor Green

# ── 4. npm install (TUI) ──────────────────────────────────────
Write-Host "`n[5/6] npm install (Ink TUI)..." -ForegroundColor Yellow
Push-Location "tui"
& "$nodeDir\npm.cmd" install
$npmExit = $LASTEXITCODE
Pop-Location
if ($npmExit -ne 0) { Write-Error "npm install failed"; Read-Host; exit 1 }
Write-Host "  Done." -ForegroundColor Green

# ── 5. Desktop shortcut ────────────────────────────────────────
Write-Host "`n[6/6] Creating desktop shortcut..." -ForegroundColor Yellow
$desktop  = [Environment]::GetFolderPath('Desktop')
$runPs1   = Join-Path $workDir "run.ps1"
$iconPath = Join-Path $workDir "logo\logo.ico"

# Preset initial columns/rows = roughly half the primary screen. This is done at
# the terminal level (Windows Terminal --size) so it never fights Ink's renderer.
$cols = 100
$rows = 30
try {
    Add-Type -AssemblyName System.Windows.Forms
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    # Approximate default console cell size at 100% DPI (~10x20 px).
    $cols = [Math]::Max(80,  [int](($screen.Width  / 2) / 10))
    $rows = [Math]::Max(24,  [int](($screen.Height / 2) / 20))
} catch {}

# Prefer launching through Windows Terminal at the preset size; fall back to
# run.bat (default console) if wt.exe isn't present.
$wtAlias = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\wt.exe"

$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut((Join-Path $desktop "NIM MCP.lnk"))
if (Test-Path $wtAlias) {
    $shortcut.TargetPath = $wtAlias
    $shortcut.Arguments  = "--size $cols,$rows powershell -NoProfile -ExecutionPolicy Bypass -File `"$runPs1`""
    Write-Host "  Windows Terminal detected -- shortcut presets ${cols}x${rows} (cols x rows)." -ForegroundColor Green
} else {
    $shortcut.TargetPath = Join-Path $workDir "run.bat"
    Write-Host "  wt.exe not found -- shortcut uses default console size." -ForegroundColor Yellow
}
$shortcut.WorkingDirectory = $workDir
$shortcut.IconLocation = $iconPath
$shortcut.Save()
Write-Host "  Done." -ForegroundColor Green

# ── Done ──────────────────────────────────────────────────────
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Setup complete." -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
Write-Host "  Start TUI:" -ForegroundColor White
Write-Host "    run.bat" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Read-Host "`nPress Enter to exit"
