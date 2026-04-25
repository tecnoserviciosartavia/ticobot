# 🔍 Guía Completa: Verificación de Tokens Push Notifications

## 📊 Flujo de Registro de Tokens

El flujo normal debería ser:

```
1. App se abre en Android
   ↓
2. Se llama registerPushDeviceForApp() desde AuthenticatedLayout.tsx
   ↓
3. PushNotifications.register() solicita el token a Firebase
   ↓
4. Se recibe el token en el listener 'registration'
   ↓
5. Se envía POST /api/push/device-token con el token
   ↓
6. Laravel lo guarda en push_device_tokens (BD)
   ↓
7. Se puede enviar notificaciones a ese token
```

## 🧪 Pruebas Paso a Paso

### PRUEBA 1: Verificar Tokens en BD

```bash
php scripts/test_push_token.php list
```

**Posibles resultados:**

- ✅ **Hay tokens activos**: El dispositivo se registró correctamente
- ❌ **No hay tokens**: El dispositivo NO registró un token (ver PRUEBA 2)

### PRUEBA 2: Diagnosticar Problemas

```bash
php scripts/diagnose_firebase.php
```

Este script verifica:
- ✅ Firebase service account configuration
- ✅ BD push_device_tokens
- ✅ Variables de entorno
- ✅ Servicio PushNotificationService

### PRUEBA 3: Enviar Notificación de Prueba

Una vez que haya tokens registrados:

```bash
# Opción A: Enviar a un token específico
php scripts/test_push_token.php send <token_completo>

# Opción B: Enviar al usuario 1
php scripts/test_push_token.php send user:1
```

Si ves el mensaje en tu teléfono = **¡Funciona! ✅**

## 🚨 Troubleshooting

### ❌ "No hay tokens registrados"

**Posible Causa 1: VITE_ENABLE_PUSH_REGISTRATION no está activo**

```bash
# Verifica en .env
grep VITE_ENABLE_PUSH_REGISTRATION .env
```

Si no está definida o es diferente a "1" o "true", el registro está deshabilitado.

**Solución:**
```bash
# Edita .env
VITE_ENABLE_PUSH_REGISTRATION=1

# Rebuilds la app
npm run build
```

---

**Posible Causa 2: google-services.json no está configurado**

El archivo `google-services.json` debe estar en `android/app/`

```bash
ls -la android/app/google-services.json
```

Si no existe, descárgalo de Firebase Console:
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto
3. Configuración → Descargar google-services.json
4. Colócalo en `android/app/`
5. Rebuild APK

---

**Posible Causa 3: Permisos de notificación no concedidos**

En Android 13+, la app solicita permisos. El usuario debe aceptar.

Si rechazó:
1. Abre Configuración → Aplicaciones → Tu App → Permisos
2. Habilita Notificaciones
3. Abre nuevamente la app

---

**Posible Causa 4: GOOGLE_APPLICATION_CREDENTIALS no configurada**

```bash
# Verifica
grep GOOGLE_APPLICATION_CREDENTIALS .env
```

Si no está, agrega:

```bash
# El archivo debe estar en la carpeta del proyecto o con ruta absoluta
GOOGLE_APPLICATION_CREDENTIALS=firebase-credentials.json
```

---

### ❌ "Error al enviar notificación"

Revisar logs:

```bash
tail -f storage/logs/laravel.log | grep -i push
tail -f storage/logs/laravel.log | grep -i fcm
```

**Errores comunes:**

- `UNREGISTERED`: El token ya no es válido. El token se desactiva automáticamente.
- `INVALID_ARGUMENT`: El token malformado o credenciales incorrectas.
- Timeout: Firebase no responde (problema de conectividad).

---

## 🔧 Configuración Requerida

### Backend (.env)

```bash
# Firebase service account
GOOGLE_APPLICATION_CREDENTIALS=firebase-credentials.json

# Variable de entorno para habilitar push en web
VITE_ENABLE_PUSH_REGISTRATION=1
```

### Frontend (.env)

```bash
VITE_ENABLE_PUSH_REGISTRATION=1
```

### Android (android/app/build.gradle)

Debe tener Firebase agregado. Verifica que tenga:

```gradle
dependencies {
    implementation 'com.google.firebase:firebase-messaging'
}
```

### Android (google-services.json)

Debe existir en `android/app/google-services.json`

---

## 📱 Verificación en Dispositivo

**Desde la app:**

1. Abre Chrome DevTools (si es posible)
2. Ve a Application → Local Storage
3. Busca la clave que guarde el token (si existe)

**Desde el servidor:**

```bash
php artisan tinker

# Ver todos los tokens
>>> PushDeviceToken::all();

# Ver tokens de un usuario específico
>>> User::find(1)->pushDeviceTokens;

# Ver el último token registrado
>>> PushDeviceToken::latest()->first();
```

---

## ✅ Checklist Final

- [ ] `VITE_ENABLE_PUSH_REGISTRATION=1` en .env
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` apunta a firebase-credentials.json
- [ ] `google-services.json` existe en `android/app/`
- [ ] Firebase project está activo
- [ ] APK fue generado DESPUÉS de configurar lo anterior
- [ ] La app solicita permisos y el usuario acepta
- [ ] `php scripts/test_push_token.php list` muestra tokens activos
- [ ] `php scripts/test_push_token.php send user:1` envía notificación exitosamente

---

## 🚀 Comando Rápido para Verificar Todo

```bash
#!/bin/bash
echo "🔍 Checklist Rápido:"
echo ""
echo "1. Tokens en BD:"
php scripts/test_push_token.php list | head -n 5
echo ""
echo "2. Diagnóstico Firebase:"
php scripts/diagnose_firebase.php
echo ""
echo "3. Si hay tokens, prueba envío:"
echo "   php scripts/test_push_token.php send user:1"
```

---

## 📞 Debugging Remoto

Si todo falla, obtén info para debugging:

```bash
# Guardar en archivo
php scripts/diagnose_firebase.php > firebase-diagnostics.txt
php scripts/test_push_token.php list >> firebase-diagnostics.txt

# Ver los logs
tail -n 100 storage/logs/laravel.log >> firebase-diagnostics.txt

# Exportar
cat firebase-diagnostics.txt
```

Comparte este archivo si necesitas ayuda adicional.
