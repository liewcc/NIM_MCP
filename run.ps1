$root    = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeDir = Join-Path $root ".node_venv"
$tuiDir  = Join-Path $root "tui"

$lockFile = Join-Path $tuiDir ".tui.lock"

if (Test-Path $lockFile) {
    $existingPid = (Get-Content $lockFile -Raw -ErrorAction SilentlyContinue)
    if ($existingPid) { $existingPid = $existingPid.Trim() }
    if ($existingPid -match '^\d+$' -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
        Write-Error "TUI appears to already be running (PID $existingPid). Close that window before starting a new one."
        Read-Host "Press Enter to exit"; exit 1
    }
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}
Set-Content -Path $lockFile -Value $PID -NoNewline

if (-not (Test-Path "$nodeDir\node.exe")) {
    Write-Error "Portable Node.js not found. Run setup.bat first."
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    Read-Host "Press Enter to exit"; exit 1
}

$env:PATH = "$nodeDir;" + $env:PATH
Set-Location $tuiDir

# Build quietly; only surface output if it fails (keeps the TUI screen clean).
$buildOutput = & "$nodeDir\node.exe" build.mjs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    $buildOutput | Write-Host
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    Read-Host; exit 1
}

Clear-Host
& "$nodeDir\node.exe" "dist\app.mjs"

Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
