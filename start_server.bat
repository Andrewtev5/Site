@echo off
cd /d "%~dp0"

where sqllocaldb >nul 2>&1
if not errorlevel 1 (
    sqllocaldb start MSSQLLocalDB >nul 2>&1
    python -c "import server; connection = server.connect(); connection.close()" >nul 2>&1
    if errorlevel 1 (
        echo LocalDB connection failed. Restarting MSSQLLocalDB...
        sqllocaldb stop MSSQLLocalDB >nul 2>&1
        sqllocaldb start MSSQLLocalDB >nul 2>&1
        timeout /t 2 /nobreak >nul
    )
)

python server.py
if errorlevel 1 pause
