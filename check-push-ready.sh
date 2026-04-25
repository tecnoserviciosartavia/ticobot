#!/bin/bash

# 🔍 Script para verificar si la app está lista para registrar tokens push

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "   ✅ PRE-BUILD CHECKLIST - PUSH NOTIFICATIONS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

SUCCESS=true

# 1. Verificar .env
echo "1️⃣  VERIFICAR .env"
echo "───────────────────────────────────────────────────────────────"

if grep -q "VITE_ENABLE_PUSH_REGISTRATION=true" .env; then
    echo "✅ VITE_ENABLE_PUSH_REGISTRATION=true"
else
    echo "❌ VITE_ENABLE_PUSH_REGISTRATION no está configurada o no es 'true'"
    echo "   Solución: Agregar a .env:"
    echo "   VITE_ENABLE_PUSH_REGISTRATION=true"
    SUCCESS=false
fi

if grep -q "FCM_SERVICE_ACCOUNT_PATH" .env; then
    echo "✅ FCM_SERVICE_ACCOUNT_PATH está configurada"
else
    echo "⚠️  FCM_SERVICE_ACCOUNT_PATH no encontrada"
fi

echo ""

# 2. Verificar archivo Firebase
echo "2️⃣  VERIFICAR CREDENCIALES FIREBASE"
echo "───────────────────────────────────────────────────────────────"

FCM_PATH=$(grep "FCM_SERVICE_ACCOUNT_PATH" .env | cut -d'=' -f2 | tr -d ' ')
if [ -z "$FCM_PATH" ]; then
    FCM_PATH="storage/app/firebase-service-account.json"
fi

if [ -f "$FCM_PATH" ]; then
    echo "✅ Archivo encontrado: $FCM_PATH"
    if file "$FCM_PATH" | grep -q "JSON"; then
        echo "✅ Es archivo JSON válido"
    fi
else
    echo "❌ Archivo NO encontrado: $FCM_PATH"
    echo "   Descárgalo de Firebase Console"
    SUCCESS=false
fi

echo ""

# 3. Verificar google-services.json en Android
echo "3️⃣  VERIFICAR google-services.json ANDROID"
echo "───────────────────────────────────────────────────────────────"

if [ -f "android/app/google-services.json" ]; then
    echo "✅ google-services.json encontrado en android/app/"
else
    echo "❌ google-services.json NO encontrado en android/app/"
    echo "   Descárgalo de Firebase Console:"
    echo "   1. Ve a https://console.firebase.google.com/"
    echo "   2. Proyecto → Configuración → Descargar google-services.json"
    echo "   3. Colócalo en android/app/google-services.json"
    SUCCESS=false
fi

echo ""

# 4. Verificar dependencias
echo "4️⃣  VERIFICAR CONFIGURACIÓN ANDROID"
echo "───────────────────────────────────────────────────────────────"

if grep -q "firebase-messaging" android/app/build.gradle; then
    echo "✅ com.google.firebase:firebase-messaging está en build.gradle"
else
    echo "⚠️  firebase-messaging no encontrada en build.gradle"
    echo "   Puede necesitar agregarse manualmente"
fi

echo ""

# 5. Verificar permisos AndroidManifest
echo "5️⃣  VERIFICAR PERMISOS ANDROID"
echo "───────────────────────────────────────────────────────────────"

if grep -r "POST_NOTIFICATIONS" android/app/src/main/AndroidManifest.xml 2>/dev/null; then
    echo "✅ Permiso POST_NOTIFICATIONS está configurado"
else
    echo "⚠️  POST_NOTIFICATIONS no encontrado"
    echo "   Necesario para Android 13+"
fi

echo ""

# 6. Resumen
echo "═══════════════════════════════════════════════════════════════"
if [ "$SUCCESS" = true ]; then
    echo "✅ ¡TODO LISTO! Procede con:"
    echo ""
    echo "   npm run build"
    echo "   npx capacitor build android --prod"
    echo ""
    echo "Luego:"
    echo "   1. Instala el APK en tu dispositivo"
    echo "   2. Abre la app e inicia sesión"
    echo "   3. Acepta permisos de notificación"
    echo "   4. Ejecuta: php scripts/test_push_token.php list"
else
    echo "❌ HAY PROBLEMAS A RESOLVER"
    echo ""
    echo "Soluciona los errores arriba y vuelve a ejecutar este script"
fi

echo ""
