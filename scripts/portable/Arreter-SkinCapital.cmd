@echo off
rem Arrete le serveur SkinCapital (lit le PID ecrit par le lanceur).
set "PIDFILE=%~dp0app\data\server.pid"
if not exist "%PIDFILE%" (
  echo SkinCapital ne semble pas demarre.
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)
set /p SRVPID=<"%PIDFILE%"
rem Ne tuer que si ce PID est bien un process node (evite de tuer un PID recycle).
tasklist /FI "PID eq %SRVPID%" /FI "IMAGENAME eq node.exe" 2>nul | find "%SRVPID%" >nul
if %ERRORLEVEL%==0 (
  taskkill /PID %SRVPID% /F >nul 2>&1
)
del "%PIDFILE%" >nul 2>&1
echo SkinCapital est arrete.
ping -n 3 127.0.0.1 >nul
