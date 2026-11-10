@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0migrate.ps1" %*
exit /b %ERRORLEVEL%
