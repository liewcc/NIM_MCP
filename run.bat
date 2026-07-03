@echo off
setlocal enabledelayedexpansion
title NIM MCP

set "ROOT=%~dp0"
set "NODEDIR=%ROOT%.node_venv"
set "TUIDIR=%ROOT%tui"
set "LOCKFILE=%TUIDIR%\.tui.lock"

rem ponytail: no real PID liveness check here (batch has no clean way to read
rem its own PID like PowerShell's $PID) -- just ask the user to confirm instead
rem of silently blocking on a stale lock from a crashed session.
if exist "%LOCKFILE%" (
    echo A previous NIM MCP session's lock file was found.
    echo If NIM MCP is already open in another window, close it first.
    choice /c YN /m "Continue anyway"
    if errorlevel 2 exit /b 1
)
echo running > "%LOCKFILE%"

if not exist "%NODEDIR%\node.exe" (
    echo Portable Node.js not found. Run setup.bat first.
    del /f /q "%LOCKFILE%" >NUL 2>&1
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
    del /f /q "%LOCKFILE%" >NUL 2>&1
    popd
    pause
    exit /b 1
)
del /f /q "%TEMP%\nim_mcp_build.log" >NUL 2>&1

cls
"%NODEDIR%\node.exe" dist\app.mjs
popd

del /f /q "%LOCKFILE%" >NUL 2>&1
endlocal
