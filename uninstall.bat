@echo off
setlocal

echo Binwright CEP Extension - Uninstaller
echo Close Premiere Pro before uninstalling.
echo.

choice /C YN /N /M "Remove Binwright from this Windows account? [Y/N] "
if "%ERRORLEVEL%"=="2" exit /b 0
if not "%ERRORLEVEL%"=="1" exit /b 1

rem Remove only the per-user CEP installation. Shared CEP registry settings are kept.
powershell.exe -NoProfile -Command ^
    "$ErrorActionPreference = 'Stop';" ^
    "$target = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.binwright.cep'));" ^
    "try { $entry = Get-Item -LiteralPath $target -Force } catch [System.Management.Automation.ItemNotFoundException] { Write-Host 'Binwright is already uninstalled.'; exit 0 };" ^
    "if (-not $entry.PSIsContainer) { throw 'The Binwright installation path is not a directory.' };" ^
    "if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { [IO.Directory]::Delete($target, $false) }" ^
    "else { $manifest = [xml](Get-Content -LiteralPath (Join-Path $target 'CSXS\manifest.xml') -Raw); if ($manifest.ExtensionManifest.ExtensionBundleId -cne 'com.binwright.cep') { throw 'The installed folder could not be identified as Binwright.' }; [IO.Directory]::Delete($target, $true) };" ^
    "Write-Host 'Binwright was removed. Restart Premiere Pro to refresh the Extensions menu.'"

set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo Uninstall failed. Check the message above.
echo.
pause
exit /b %RESULT%
