@echo off
title FocusGuard Windows Notifications
cd /d "C:\Users\Maphuma\Desktop\trader blocker 3\scripts"
echo ========================================
echo   FocusGuard Windows Notification Service
echo ========================================
echo.
echo Features:
echo • Notifications appear in bottom-right corner
echo • Trumpet sound plays once per alert
echo • Stays for 10 seconds
echo • Appears over any app
echo.
echo Make sure blocker is running:
echo python focusguard_blocker.py
echo.
echo Starting notification service...
echo.

python alert_service.py
pause