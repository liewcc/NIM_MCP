@echo off
setlocal enabledelayedexpansion
title NIM MCP

set "ROOT=%~dp0"
set "NODEDIR=%ROOT%.node_venv"
set "TUIDIR=%ROOT%tui"

rem ponytail: detect running TUI by window title instead of lock file —
rem lock files go stale when the terminal is closed mid-session.
tasklist /fi "WINDOWTITLE eq NIM MCP" /fo csv /nh 2>NUL | findstr /i "cmd.exe wt.exe" >NUL 2>&1
if not errorlevel 1 (
    echo NIM MCP is already running in another window.
    pause
    exit /b 1
)

if not exist "%NODEDIR%\node.exe" (
    echo Portable Node.js not found. Run setup.bat first.
    pause
    exit /b 1
)

set "PATH=%NODEDIR%;%PATH%"
pushd "%TUIDIR%"

rem Build quietly; only surface output if it fails (keeps the TUI screen clean).
"%NODEDIR%\node.exe" build.mjs >"%TEMP%\nim_mcp_build.log" 2>&1
if errorlevel 1 (
    echo Build failed:
    type "%TEMP%\nim_mcp_build.log"
    del /f /q "%TEMP%\nim_mcp_build.log" >NUL 2>&1
    popd
    pause
    exit /b 1
)
del /f /q "%TEMP%\nim_mcp_build.log" >NUL 2>&1

cls
"%NODEDIR%\node.exe" dist\app.mjs
popd

endlocal
