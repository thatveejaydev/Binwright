@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo     Binwright CEP Extension - Installer for Premiere Pro
echo ===================================================
echo.

:: 1. Enable CEP Debug Mode in Windows Registry for all versions
echo [1/3] Enabling CEP Developer Mode in Registry...
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
echo   [+] Registry PlayerDebugMode enabled!

:: 2. Target Adobe CEP Directory
set "TARGET_DIR=%APPDATA%\Adobe\CEP\extensions\com.binwright.cep"
set "SOURCE_DIR=%~dp0com.binwright.ppro"
:: Remove trailing backslash
if "%SOURCE_DIR:~-1%"=="\" set "SOURCE_DIR=%SOURCE_DIR:~0,-1%"

echo.
echo [2/3] Installing extension to:
echo       %TARGET_DIR%

if not exist "%APPDATA%\Adobe\CEP\extensions" (
    mkdir "%APPDATA%\Adobe\CEP\extensions"
)

:: Remove existing directory or junction if present
if exist "%TARGET_DIR%" (
    rmdir /S /Q "%TARGET_DIR%" 2>nul
)

:: Try creating Directory Junction first (ideal for live development)
mklink /J "%TARGET_DIR%" "%SOURCE_DIR%" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [+] Linked to the Binwright extension folder.
) else (
    :: Fallback to directory copy
    xcopy "%SOURCE_DIR%" "%TARGET_DIR%\" /E /I /H /Y /Q >nul 2>&1
    echo   [+] Copied extension files to Adobe CEP folder.
)

echo.
echo [3/3] Installation Complete!
echo.
echo ===================================================
echo   HOW TO OPEN IN PREMIERE PRO:
echo   1. Launch or restart Adobe Premiere Pro.
echo   2. Open any project.
echo   3. Go to top menu: Window -^> Extensions -^> Binwright
echo   4. To debug, open Chrome and navigate to:
echo      http://localhost:8128
echo ===================================================
echo.
pause
