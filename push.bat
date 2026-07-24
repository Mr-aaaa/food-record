@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ========================================
echo   推送到 GitHub 并自动部署
echo ========================================
echo.

REM 配置代理（端口 7897）
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897
git config credential.helper manager
git config http.sslBackend openssl

echo 正在推送到 GitHub（通过代理 127.0.0.1:7897）...
echo 首次推送会弹出浏览器登录窗口，请用 GitHub 账号登录
echo.

git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo ========================================
    echo   推送成功！
    echo ========================================
    echo GitHub 正在自动构建部署，约 1-2 分钟后可访问。
    echo.
    echo 下一步：
    echo   1. 打开 https://github.com/Mr-aaaa/food-record/settings/pages
    echo   2. Source 选择 GitHub Actions
    echo   3. 等待构建完成后访问：
    echo      https://mr-aaaa.github.io/food-record/
) else (
    echo ========================================
    echo   推送失败
    echo ========================================
    echo 请检查：
    echo   - 代理是否正在运行（端口 7897）
    echo   - 浏览器弹窗中是否完成了 GitHub 登录
)

echo.
pause
