@echo off
setlocal
title Binwright Installer

set "ACCENT="
set "SUCCESS="
set "FAILURE="
set "RESET="
if defined WT_SESSION (
    for /f "delims=" %%E in ('echo prompt $E^| cmd /d /q') do (
        set "ACCENT=%%E[95m"
        set "SUCCESS=%%E[92m"
        set "FAILURE=%%E[91m"
        set "RESET=%%E[0m"
    )
)

echo.
echo   %ACCENT%B I N W R I G H T%RESET%
echo   Premiere Pro extension installer
echo   --------------------------------
echo.

:: 1. Enable CEP Debug Mode in Windows Registry for all versions
echo   %ACCENT%[1/2]%RESET% Configuring Adobe CEP...
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.7" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.8" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.14" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.15" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.16" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1

:: 2. Target Adobe CEP Directory
set "TARGET_DIR=%APPDATA%\Adobe\CEP\extensions\com.binwright.cep"
set "SOURCE_DIR=%~dp0com.binwright.ppro"
:: Remove trailing backslash
if "%SOURCE_DIR:~-1%"=="\" set "SOURCE_DIR=%SOURCE_DIR:~0,-1%"

echo   %ACCENT%[2/2]%RESET% Installing Binwright...

if not exist "%APPDATA%\Adobe\CEP\extensions" (
    mkdir "%APPDATA%\Adobe\CEP\extensions"
)

:: Remove existing directory or junction if present
if exist "%TARGET_DIR%" (
    rmdir /S /Q "%TARGET_DIR%" 2>nul
)

:: Try creating Directory Junction first (ideal for live development)
mklink /J "%TARGET_DIR%" "%SOURCE_DIR%" >nul 2>&1
if errorlevel 1 (
    rem Fall back to a directory copy.
    xcopy "%SOURCE_DIR%" "%TARGET_DIR%\" /E /I /H /Y /Q >nul 2>&1
    if errorlevel 1 goto :install_failed
)

echo.
echo   %SUCCESS%Installed successfully%RESET%
echo   Open or restart Premiere Pro, then open a project.
echo   %ACCENT%Window -^> Extensions -^> Binwright%RESET%
echo.
echo   Press any key to close.
pause >nul
exit /b 0

:install_failed
echo.
echo   %FAILURE%Installation failed%RESET%
echo   Could not install the extension at:
echo   "%TARGET_DIR%"
echo.
echo   Press any key to close.
pause >nul
exit /b 1
