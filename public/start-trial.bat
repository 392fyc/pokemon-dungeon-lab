@echo off
rem Double-click to play the private trial build in your browser. Close the window to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-trial.ps1"
if errorlevel 1 pause
