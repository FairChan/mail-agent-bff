@echo off
setlocal

echo Database Migration Tool
echo =========================

set COMMAND=%1
if "%COMMAND%"=="" set COMMAND=status

if "%COMMAND%"=="status" (
    echo Checking migration status...
    npx prisma migrate status
) else if "%COMMAND%"=="create" (
    set NAME=%2
    if "%NAME%"=="" set NAME=%date:~0,4%%date:~5,2%%date:~8,2%
    echo Creating migration: %NAME%
    npx prisma migrate dev --name %NAME%
) else if "%COMMAND%"=="deploy" (
    echo Deploying migrations...
    npx prisma migrate deploy
) else if "%COMMAND%"=="reset" (
    echo WARNING: This will destroy all data!
    set /p CONFIRM="Type 'yes' to confirm: "
    if "%CONFIRM%"=="yes" (
        npx prisma migrate reset --force
    ) else (
        echo Cancelled.
    )
) else if "%COMMAND%"=="studio" (
    echo Opening Prisma Studio...
    npx prisma studio
) else if "%COMMAND%"=="validate" (
    echo Validating schema...
    npx prisma validate
) else if "%COMMAND%"=="generate" (
    echo Generating Prisma Client...
    npx prisma generate
) else if "%COMMAND%"=="seed" (
    echo Seeding database...
    npx prisma db seed
) else (
    echo Usage: migrations.bat {status^|create^|deploy^|reset^|studio^|validate^|generate^|seed}
)