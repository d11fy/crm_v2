@echo off
chcp 65001 > nul
title اختبار بوت واتساب
color 0B

echo.
echo  ========================================
echo    اختبار بوت واتساب — إرسال رسالة تجريبية
echo  ========================================
echo.

node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo  [خطأ] Node.js غير مثبت!
    pause & exit
)

if not exist "node_modules" (
    echo  تثبيت المكتبات...
    npm install
)

echo  شغّل QR وامسحه بهاتفك...
echo.
node test-wa.js

pause
