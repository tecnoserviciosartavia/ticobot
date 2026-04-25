# 📱 APK Listo - Instrucciones Finales

## ✅ APK Generado

**Ubicación:** `android/app/build/outputs/apk/debug/app-debug.apk`  
**Tamaño:** 8.1 MB  
**Fecha:** 24 de abril de 2026

---

## 🚀 Próximos Pasos

### 1️⃣ Descargar el APK a tu dispositivo

```bash
# Opción A: Transferir por ADB (si tienes Android SDK)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Opción B: Copiar a una carpeta compartida y descargar manualmente
cp android/app/build/outputs/apk/debug/app-debug.apk ~/app-debug.apk
```

### 2️⃣ Instalar en tu dispositivo Android

1. **Habilitar instalación de apps de fuentes desconocidas:**
   - Configuración → Aplicaciones → Permisos especiales → Instalar apps desconocidas
   - Dale permiso a tu navegador o gestor de archivos

2. **Abrir el APK:**
   - Usa tu gestor de archivos para navegar a `app-debug.apk`
   - Toca el archivo para instalar

3. **Seguir las instrucciones:**
   - Tap en "Instalar"
   - Espera a que termine

### 3️⃣ Abrir la app

1. Busca "TicoBot" en tu lista de aplicaciones
2. Abre la app
3. Inicia sesión con tus credenciales

### 4️⃣ Aceptar permisos de notificación

Cuando la app abra:
- Debería solicitar permiso para enviar notificaciones
- **TAP EN "PERMITIR"** (es crítico)

### 5️⃣ Verificar que el token se registró

```bash
# En tu servidor, ejecuta:
php scripts/test_push_token.php list
```

Si ves algo como esto = **¡ÉXITO! ✅**

```
📋 TOKENS REGISTRADOS:
─────────────────────────────────
ID: 1
Token: f_gSjxdK4oL2mP9qR8vW...
Usuario ID: 1 (Admin User)
Platform: android
Estado: ✅ ACTIVO
...
Total: 1 token(s)
✅ Activos: 1
```

### 6️⃣ Enviar notificación de prueba

```bash
php scripts/test_push_token.php send user:1
```

Verifica tu teléfono en los próximos segundos. Deberías ver una notificación:

> 🧪 Prueba de Notificación
> 
> Si ves este mensaje, ¡las notificaciones push funcionan! ✅

---

## 🔍 Si Algo Falla

### ❌ "No se registró el token"

**Causa más probable:** El permiso de notificaciones no fue aceptado.

**Solución:**
1. Abre Configuración → Aplicaciones → TicoBot → Permisos
2. Habilita "Notificaciones"
3. Abre la app de nuevo
4. Vuelve a verificar

### ❌ "Error al enviar notificación"

Revisa los logs:

```bash
tail -f storage/logs/laravel.log | grep -i push
```

Si ves "UNREGISTERED", es que el token ya no es válido. Vuelve a abrir la app.

---

## 📋 Resumen de Cambios Realizados

1. ✅ Agregado `firebase-messaging` a `android/app/build.gradle`
2. ✅ Agregado permiso `POST_NOTIFICATIONS` a `AndroidManifest.xml`
3. ✅ Verificado que `VITE_ENABLE_PUSH_REGISTRATION=true` en `.env`
4. ✅ Verificado que `google-services.json` existe
5. ✅ Compilado con `npm run build`
6. ✅ Generado APK con `npx capacitor build android`

---

## 📞 Comandos Útiles

```bash
# Listar todos los tokens
php scripts/test_push_token.php list

# Enviar notificación de prueba
php scripts/test_push_token.php send user:1

# Limpiar tokens inactivos
php scripts/test_push_token.php clean

# Información de configuración
php scripts/test_push_token.php info

# Diagnóstico completo
php scripts/diagnose_firebase.php
```

---

## ✨ ¿Funcionó?

Si todo está bien:
- ✅ App instalada
- ✅ Token registrado en BD
- ✅ Notificación recibida

**¡Entonces el problema está RESUELTO! 🎉**

---

**Creado:** 24 de abril de 2026
