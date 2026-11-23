@echo off
cd /d "%~dp0party-home-pos"
node scripts\launch.mjs
if errorlevel 1 pause
