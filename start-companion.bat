@echo off
rem Starts the Yoto Local companion. The web app's "Start companion" button runs this file.
title Yoto Local companion
cd /d "%~dp0"
call npm start
if errorlevel 1 pause
