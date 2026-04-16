@echo off
REM OWASP ZAP Security Scan for Windows

set TARGET_URL=%TARGET_URL:=http://localhost:3000%
set REPORT_FILE=zap-report-%date:~0,4%%date:~5,2%%date:~8,2%-%time:~0,2%%time:~3,2%%time:~6,2%.json
set REPORT_FILE=%REPORT_FILE: =0%

echo Starting OWASP ZAP Security Scan
echo Target: %TARGET_URL%
echo Report: %REPORT_FILE%

docker run --rm ^
  -v "%cd%:/zap/wrk:rw" ^
  -w /zap/wrk ^
  -e TARGET_URL="%TARGET_URL%" ^
  owasp/zap2docker-stable:latest ^
  zap-baseline.py -t "%TARGET_URL%" -J "%REPORT_FILE%" -I

if errorlevel 1 (
  echo Scan completed with warnings
) else (
  echo Scan completed successfully
)
