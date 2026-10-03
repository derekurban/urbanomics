@echo off
rem Development launcher for the unpacked build. It uses the repository workspace; the installed
rem release is a separate app with its own workspace (see docs/releases.md).
set "URBANOMICS_DATA_DIR=%~dp0private\desktop"
set "URBANOMICS_CONFIG_DIR=%~dp0configuration"
start "" "%~dp0release\win-unpacked\Urbanomics.exe"
