@echo off
set "URBANOMICS_DATA_DIR=%~dp0private\desktop"
set "URBANOMICS_CONFIG_DIR=%~dp0configuration"
start "" "%~dp0release\win-unpacked\Urbanomics.exe"
