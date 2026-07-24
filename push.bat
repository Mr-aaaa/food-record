@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ========================================
echo   推送到 GitHub 并自动部署
echo ========================================
echo.

REM 配置凭据助手（只需一次）
git config credential.helper manager
git config http.sslBackend openssl

echo 正在推送到 GitHub...
echo 首次推送会弹出浏览器登录窗口，请用 GitHub 账号登录
echo.

git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo 推送成功！
    echo GitHub 正在自动构建部署，约 1-2 分钟后可访问。
    echo.
    echo 下一步：
    echo   1. 打开 https://github.com/Mr-aaaa/food-record/settings/pages
    echo   2. Source 选择 "GitHub Actions"
    echo   3. 等待构建完成后访问网站
) else (
    echo 推送失败，请检查错误信息。
    echo 如果是认证问题，请确保在弹出的浏览器窗口中登录了 GitHub。
)

echo.
pause
