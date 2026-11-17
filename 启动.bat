@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 金句时间轴 · 播客高光裁剪台

echo ============================================
echo   金句时间轴 · 播客高光裁剪台 启动器
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有检测到 Node.js。
  echo 请先到 https://nodejs.org 下载安装 LTS 版本，再重新双击本脚本。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 首次运行，正在安装依赖，请稍候 ^(需要联网^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo.
echo 正在启动，浏览器将自动打开 http://localhost:5178
echo 关闭此窗口即可停止服务。
echo.
call npm run dev
pause