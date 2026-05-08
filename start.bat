@echo off
title Music Bot & Lavalink Launcher
color 0b

echo =========================================
echo       Starting Music Bot Ecosystem       
echo =========================================
echo.

echo [1/3] Starting Lavalink Server...
cd lavalink
:: Launch Lavalink in a completely separate command prompt window
start "Lavalink Server" cmd /k "title Lavalink Server & java -Xmx2G -Xms2G -XX:+UseG1GC -jar Lavalink.jar"

:: Return to the root 'Music Bot' folder
cd ..

echo.
echo [2/3] Waiting for Lavalink to fully initialize...
echo       (Dynamically polling Port 2333)

:WaitLoop
:: Check if Lavalink is listening on port 2333
netstat -ano | find "LISTENING" | find ":2333" >nul

:: If the port is NOT found, errorlevel will be 1
if %errorlevel% neq 0 (
    :: Wait 2 seconds silently, then loop back and check again
    timeout /t 2 >nul
    goto WaitLoop
)

echo.
echo [SUCCESS] Lavalink is UP and accepting connections!
echo.
echo [3/3] Starting the Discord Bot application...
echo =========================================
echo.

:: Start the Node.js application in this original window
npm run dev

pause