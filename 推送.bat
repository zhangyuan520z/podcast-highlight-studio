@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 推送到 GitHub

echo ============================================
echo   推送本地提交到 GitHub
echo ============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有检测到 Git，请先安装 Git for Windows。
  echo.
  pause
  exit /b 1
)

echo 正在推送，请确保当前网络能访问 GitHub...
echo.
git push
if errorlevel 1 (
  echo.
  echo [失败] 推送没有成功，多半是当前网络连不上 GitHub。
  echo 可换手机热点、切换网络或开启代理后，再双击本脚本重试。
  echo.
  pause
  exit /b 1
)

echo.
echo [成功] 本地提交已推送到 GitHub。
echo.
pause
