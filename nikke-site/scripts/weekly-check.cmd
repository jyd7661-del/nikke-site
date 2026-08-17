@echo off
REM Weekly auto-check launcher, called by Windows Task Scheduler.
REM
REM ASCII ONLY IN THIS FILE. cmd.exe reads .cmd in the OEM codepage (949 here),
REM not UTF-8, so Korean comments turn into garbage that cmd tries to execute.
REM That actually happened on 2026-08-17. Keep the explanation in weeklyCheck.mjs
REM (node reads UTF-8 fine); keep this file plain.
REM
REM node is called by absolute path: a scheduled run has a different PATH
REM than an interactive shell.
REM
REM Exit codes: 0 = nothing to review, 1 = findings, 2 = sources unreachable.

setlocal
set NODE="C:\Program Files\nodejs\node.exe"
cd /d "%~dp0.."

echo [%DATE% %TIME%] weekly check start
%NODE% scripts\weeklyCheck.mjs --report
set RC=%ERRORLEVEL%
echo [%DATE% %TIME%] exit code %RC%

exit /b %RC%
