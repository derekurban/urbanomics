@echo off
rem Development launcher for the unpacked build. Where the workspace lives is decided by
rem %APPDATA%\Urbanomics\workspace.json (or URBANOMICS_DATA_DIR / URBANOMICS_CONFIG_DIR).
start "" "%~dp0release\win-unpacked\Urbanomics.exe"
