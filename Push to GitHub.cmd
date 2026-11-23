@echo off
setlocal
cd /d "%~dp0"
set "POS_REMOTE=https://github.com/Ahmedvally/Party-and-home-POS.git"
set "POS_REPO=%CD:\=/%"
set "POS_GIT="
where git.exe >nul 2>nul
if not errorlevel 1 set "POS_GIT=git.exe"
if not defined POS_GIT for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%~D\resources\app\git\cmd\git.exe" set "POS_GIT=%%~D\resources\app\git\cmd\git.exe"
if not defined POS_GIT (
  echo Git was not found. Install Git for Windows or GitHub Desktop and try again.
  pause
  exit /b 1
)
if not exist .git (
  call :git init -b main
  if errorlevel 1 goto failed
)
call :git symbolic-ref --short HEAD > "%TEMP%\party-home-pos-branch.txt"
if errorlevel 1 goto failed
set /p POS_BRANCH=<"%TEMP%\party-home-pos-branch.txt"
if not "%POS_BRANCH%"=="main" (
  echo Expected the main branch. Current branch: %POS_BRANCH%.
  echo Switch to main in GitHub Desktop before running this launcher.
  pause
  exit /b 1
)
call :git remote get-url origin >nul 2>nul
if errorlevel 1 (
  call :git remote add origin "%POS_REMOTE%"
) else (
  call :git remote get-url origin > "%TEMP%\party-home-pos-remote.txt"
  set /p POS_CURRENT_REMOTE=<"%TEMP%\party-home-pos-remote.txt"
  call :checkremote
  if errorlevel 1 goto failed
)
if errorlevel 1 goto failed
echo Checking GitHub access. Sign in if Git asks you to.
call :git fetch origin
if errorlevel 1 goto failed
echo Staging application source. Live shop data and local artifacts are ignored.
call :git add --all
if errorlevel 1 goto failed
call :git diff --cached --quiet
if errorlevel 1 (
  call :git commit -m "Add branded Party and Home POS with responsive invoice and sales order editors"
  if errorlevel 1 goto failed
)
call :git rev-parse --verify HEAD >nul 2>nul
if errorlevel 1 goto failed
call :git show-ref --verify --quiet refs/remotes/origin/main
if not errorlevel 1 (
  call :git merge --no-edit --allow-unrelated-histories origin/main
  if errorlevel 1 goto failed
) else (
  call :git remote show origin > "%TEMP%\party-home-pos-origin.txt"
  findstr /c:"HEAD branch: master" "%TEMP%\party-home-pos-origin.txt" >nul
  if not errorlevel 1 (
    call :git merge --no-edit --allow-unrelated-histories origin/master
    if errorlevel 1 goto failed
  )
)
call :git push --set-upstream origin main
if errorlevel 1 goto failed
echo.
echo Push completed: %POS_REMOTE%
pause
exit /b 0

:git
"%POS_GIT%" -c "safe.directory=%POS_REPO%" %*
exit /b %errorlevel%

:checkremote
if "%POS_CURRENT_REMOTE%"=="%POS_REMOTE%" exit /b 0
echo This folder already has a different origin: %POS_CURRENT_REMOTE%
echo The launcher stopped without changing that destination.
exit /b 1

:failed
echo.
echo Push did not complete. Review the Git error above.
echo If Git reports a merge conflict, resolve it in GitHub Desktop before retrying.
echo Existing GitHub history has not been force-pushed or overwritten.
pause
exit /b 1
