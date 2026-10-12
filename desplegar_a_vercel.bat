@echo off
title Desplegar a Vercel - SistMaint CMMS
echo ==============================================================
echo       DESPLEGAR SISTEMA DE MANTENIMIENTO A VERCEL
echo ==============================================================
echo.
echo Iniciando despliegue con Vercel CLI...
echo Si es la primera vez, se abrira tu navegador para iniciar sesion.
echo.
call npx vercel
echo.
echo Para desplegar directamente a produccion ejecuta:
echo npx vercel --prod
echo.
pause
