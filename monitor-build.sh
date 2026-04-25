#!/bin/bash

# Monitorear build mientras se ejecuta
echo "⏳ El build está en progreso..."
echo "Esto puede tardar 10-20 minutos la primera vez."
echo ""

# Esperar a que capacitor termine
sleep 600  # 10 minutos inicial

# Verificar si existe el APK
if [ -f "android/app/build/outputs/apk/debug/app-debug.apk" ]; then
    echo "✅ APK generado exitosamente!"
    ls -lh android/app/build/outputs/apk/debug/app-debug.apk
elif [ -f "android/app/build/outputs/bundle/release/app-release.aab" ]; then
    echo "✅ App Bundle generado exitosamente!"
    ls -lh android/app/build/outputs/bundle/release/app-release.aab
else
    echo "⏳ Build aún en progreso..."
    echo "   Verifica: android/app/build/outputs/apk/debug/"
    echo ""
    echo "Archivos disponibles:"
    find android/app/build/outputs -name "*.apk" -o -name "*.aab" 2>/dev/null | head -10
fi
