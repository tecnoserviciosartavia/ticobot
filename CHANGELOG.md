# Historial de Cambios

## 2026-04-13

### Contratos y recordatorios
- Se corrigió la edición de contratos para persistir correctamente cantidades por servicio (`service_quantities`) y su validación.
- Se añadió prueba de regresión para confirmar que cambios de contrato (nombre, fecha, descuento, notas, cantidades) sí se guardan.
- Se mejoró la deduplicación de recordatorios con `Reminder::createOpenUnique` para evitar duplicados abiertos en misma fecha/hora.
- Se sincronizó payload de recordatorios pendientes cuando cambian datos del contrato (monto, recurrencia y fecha de cobro).
- Se ajustó la lógica del observer para preservar la fecha real de vencimiento, incluso si es pasada.

### Pagos y conciliación
- Se ajustó conciliación y pagos manuales para flujo mensual basado en `billing_month` cuando aplica.
- Se evitó reprogramar recordatorios por conciliación manual, manteniendo consistencia del período pagado.
- Se añadió soporte de `billing_cycle` en respuesta de contratos para formularios de pago.

### Servicios y costos de plataforma
- Se agregó campo `payment_day` a servicios para definir día de pago mensual de plataforma.
- Se actualizó UI de servicios para crear/editar/visualizar `payment_day`.
- Se agregó comando `services:notify-platform-payments` para enviar recordatorios de costos de plataforma a admins.
- Se creó tabla `service_payment_notifications` para deduplicar notificaciones por servicio/fecha/admin.
- Se programó ejecución automática del comando vía scheduler (`hourly`).

### WhatsApp / Bot
- Se implementó envío real de texto desde backend al bot (`/webhook/send_text`) para alertas administrativas.
- Se añadió endpoint webhook en bot para envío de texto directo por número.
- Se reforzó el manejo de sesión/estado por chat, incluyendo reinicio por cambio de día local.
- Se mejoró robustez del polling excluyendo chats `@lid` y `@broadcast` en fallback para reducir errores repetidos.

### Contabilidad y UI
- Se reordenaron pestañas de Contabilidad para que `Resumen` aparezca primero (izquierda a derecha) y sea la entrada principal.

### Configuración técnica
- Se agregó `ignoreDeprecations: "6.0"` en `bot/tsconfig.json` para compatibilidad con advertencias actuales de TypeScript.

### Pruebas y validaciones
- Suite backend en verde (40 pruebas) después de los cambios de este lote.
- Build frontend y build del bot ejecutados correctamente.
- Migraciones nuevas aplicadas correctamente.