@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 强制推送细粒度历史到 GitHub

echo ============================================
echo   强制推送本地细粒度历史到 GitHub
echo ============================================
echo.
echo 注意：本脚本会用本地历史覆盖远程 main（--force）。
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有检测到 Git，请先安装 Git for Windows。
  echo.
  pause
  exit /b 1
)

echo 正在强制推送，请确保当前网络能访问 GitHub...
echo.
git push -f origin main
if errorlevel 1 (
  echo.
  echo [失败] 推送没有成功，多半是当前网络连不上 GitHub。
  echo 可换手机热点、切换网络或开启代理后，再双击本脚本重试。
  echo.
  pause
  exit /b 1
)

echo.
echo [成功] 细粒度提交历史已覆盖到 GitHub。
echo.
pause
