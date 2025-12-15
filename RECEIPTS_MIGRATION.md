# Sistema de Comprobantes - Migración a Base de Datos

## 📋 Resumen

El sistema de comprobantes ha sido migrado del almacenamiento en archivos JSON a la base de datos MySQL para mayor escalabilidad, integridad y respaldo automático.

## ✅ Estado Actual

### Base de Datos
- **Tabla**: `payment_receipts`
- **Registros migrados**: 32 comprobantes
- **payment_id**: Ahora es nullable (permite comprobantes sin pago asignado)

### Bot WhatsApp
- **Modo**: Híbrido (JSON + Base de datos)
- **Almacenamiento local**: Mantiene JSON para compatibilidad
- **API**: Guarda automáticamente en DB vía POST /api/payments/receipts/bot

### API Endpoint
```
POST /api/payments/receipts/bot
Authorization: Bearer {token}

Body:
{
  "client_phone": "50612345678",      // Requerido si no hay payment_id
  "payment_id": 123,                  // Opcional
  "file_base64": "base64...",         // Requerido si no hay file_path
  "file_path": "/path/to/file",       // Requerido si no hay file_base64
  "file_name": "receipt.jpg",         // Requerido
  "mime_type": "image/jpeg",          // Requerido
  "received_at": "2025-12-15T...",    // Opcional (default: now)
  "metadata": {}                      // Opcional
}
```

## 🔧 Scripts Disponibles

### 1. Migración de JSON a DB
```bash
php scripts/migrate_receipts_to_database.php
```
- Migra comprobantes históricos del JSON a la base de datos
- Crea backup automático del JSON
- Solo migra comprobantes con backend_id

### 2. Test del Endpoint
```bash
php scripts/test_receipt_api.php
```
- Prueba el endpoint POST /api/payments/receipts/bot
- Crea un comprobante de prueba
- Verifica la respuesta y base de datos

## 📂 Estructura de Archivos

```
/home/fabian/ticobot/
├── bot/
│   └── data/
│       └── receipts/
│           ├── index.json              # Index actual (híbrido)
│           ├── index.json.backup.*     # Backups automáticos
│           └── receipt-*.{jpg,png,pdf} # Archivos de comprobantes
├── storage/
│   └── app/
│       └── payment-receipts/           # Nuevos comprobantes desde API
│           └── bot-receipt-*.{jpg,png}
└── scripts/
    ├── migrate_receipts_to_database.php  # Script de migración
    └── test_receipt_api.php              # Script de prueba
```

## 🔄 Flujo Actual

### Cuando el bot recibe un comprobante:

1. **Guarda archivo** en `/bot/data/receipts/receipt-*.{ext}`
2. **Registra en JSON** (`index.json`) para compatibilidad
3. **Guarda en DB** vía API (nuevo)
   - Si falla: Solo queda en JSON (fallback)
   - Si éxito: Comprobante sincronizado

### Cuando se actualiza un comprobante:

1. **Actualiza JSON** con los cambios
2. **Log en consola** para futuras sincronizaciones
3. La sincronización completa está pendiente de implementar

## 📊 Metadata Guardada

Los comprobantes nuevos incluyen metadata extendida:

```json
{
  "bot_receipt_id": "50672140974-1765827094",
  "chat_id": "50672140974@c.us",
  "status": "pending",
  "source": "bot",
  "saved_from_bot": true,
  "stored_at": "2025-12-15T19:31:34+00:00"
}
```

## ⚠️ Notas Importantes

### JSON como Fallback
El bot mantiene el sistema JSON como respaldo en caso de:
- Falla de conexión a la API
- Problemas con el servidor
- Mantenimiento de la base de datos

### Comprobantes Sin Payment ID
Los comprobantes pueden guardarse sin `payment_id`:
- Se busca automáticamente por teléfono del cliente
- Si no hay pago pendiente, se guarda sin asignar
- Pueden vincularse manualmente después

### Sincronización Pendiente
Actualizaciones de comprobantes (status, months, etc.):
- ✅ Se guardan en JSON
- ⚠️ No se sincronizan automáticamente con DB
- 💡 Futuro: Implementar endpoint PATCH para sincronizar

## 🚀 Próximos Pasos Recomendados

1. **Monitorear logs** del bot para verificar que guarda en DB
2. **Reducir dependencia del JSON** gradualmente
3. **Implementar endpoint PATCH** para actualizar comprobantes
4. **Crear tarea cron** para sincronizar comprobantes legacy
5. **Dashboard** para ver comprobantes sin payment_id asignado

## 📈 Beneficios Logrados

✅ **Escalabilidad**: Base de datos soporta millones de registros  
✅ **Respaldo**: Backups automáticos de MySQL  
✅ **Búsquedas**: Queries SQL rápidas  
✅ **Integridad**: Relaciones con payments, clients  
✅ **Reportes**: Fácil generar estadísticas  
✅ **Auditoria**: metadata completa de cada operación  

## 🔐 Seguridad

- Endpoint protegido con `auth:sanctum`
- Token configurado en `bot/.env`
- Archivos guardados fuera de public
- Validación de mime types

## 📞 Soporte

Si encuentras problemas:
1. Revisa los logs: `pm2 logs ticobot-bot`
2. Verifica Laravel logs: `tail -f storage/logs/laravel.log`
3. Consulta comprobantes en DB: `php artisan tinker`

---

**Última actualización**: 15 de diciembre de 2025  
**Versión**: 1.0.0  
**Estado**: ✅ Producción
