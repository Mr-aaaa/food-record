@echo off
chcp 65001 >nul 2>&1
set "PATH=C:\Users\24424\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
echo Building...
node node_modules\vite\bin\vite.js build
echo.
echo Starting local server...
node serve.cjs
