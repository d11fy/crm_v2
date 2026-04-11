@echo off
chcp 65001 > nul
title CRM - WhatsApp System
color 0A

echo.
echo  ==========================================
echo   CRM - Subscription Management System
echo  ==========================================
echo.

:: Check Node.js
node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed!
    echo  Download from: https://nodejs.org
    pause
    exit
)

:: Kill any existing node processes to free ports
echo  [1] Stopping old node processes...
taskkill /F /IM node.exe > nul 2>&1
timeout /t 2 /nobreak > nul

:: Install dependencies if needed
echo  [2] Checking dependencies...
if not exist "node_modules" (
    echo  [3] Installing dependencies (first time only)...
    npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to install dependencies!
        pause
        exit
    )
)

echo.
echo  [4] Starting server...
echo.
echo  ==========================================
echo   Open browser at: http://localhost:5000
echo   Go to Settings to scan WhatsApp QR
echo  ==========================================
echo.

:: Open browser after 3 seconds in background
start /b cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:5000"

node server.js

pause
