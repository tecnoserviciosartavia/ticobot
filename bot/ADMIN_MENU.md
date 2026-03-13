# Menú Admin del Bot de WhatsApp

## Activación del Menú Admin

Los usuarios administradores (configurados en `BOT_ADMIN_PHONES`) pueden acceder al menú interactivo escribiendo:

- `adminmenu`
- `admin`
- `menuadmin`

## Opciones del Menú Admin

### 1️⃣ Crear cliente + suscripción
Inicia un asistente guiado para crear un nuevo cliente y su suscripción. Solicita:
- Teléfono del cliente
- Nombre
- Monto mensual (CRC)
- Día de cobro (1-31)
- Hora de recordatorio (HH:MM)
- Concepto del servicio

### 2️⃣ Ver detalles de cliente
Muestra información completa de un cliente específico:
- Suscripciones activas
- Pagos próximos (60 días)
- Próximo vencimiento

### 3️⃣ Ver mis detalles
Muestra tus propios detalles como cliente (si estás registrado).

### 4️⃣ Listar comprobantes del día
Muestra todos los comprobantes generados en el día actual con:
- ID del comprobante
- Estado (enviado/pendiente)
- Cliente
- Hora de generación

### 5️⃣ Generar comprobante para cliente
Genera y envía automáticamente un comprobante de pago a un cliente específico por su teléfono.

### 6️⃣ Enviar comprobante por ID
Envía (o reenvía) un comprobante específico usando su ID.

### 7️⃣ Listar transacciones
Muestra las últimas transacciones registradas. Permite filtrar por teléfono de cliente o ver todas (últimas 20).

### 8️⃣ Ejecutar scheduler
Ejecuta manualmente el procesador de recordatorios (runBatch) para enviar recordatorios pendientes.

### 9️⃣ Registrar pago manual
Inicia un asistente para registrar un pago manual de un cliente:
- Teléfono del cliente
- Monto
- Moneda
- Referencia opcional

### 🔟 Conciliar pago
Permite conciliar un pago existente por su ID y actualizar su estado.

### 1️⃣1️⃣ Listar pagos pendientes
Muestra los pagos en estado pendiente/no verificado (últimos 20).

### 1️⃣2️⃣ Eliminar cliente
**⚠️ CUIDADO**: Elimina permanentemente un cliente y TODO su historial (pagos, recordatorios, suscripciones). Requiere confirmación.

### 1️⃣3️⃣ Eliminar suscripción
Elimina las suscripciones de un cliente y los pagos FUTUROS asociados. Requiere confirmación.

### 1️⃣4️⃣ Eliminar transacción
Elimina una transacción específica por su ID. Requiere confirmación.

### 1️⃣5️⃣ Estado del bot
Muestra información del estado actual del bot:
- Uptime (tiempo activo)
- Uso de memoria
- Versión de Node.js
- Timezone configurado
- Horario de atención

### 1️⃣6️⃣ Pausar / reanudar contacto (silenciar bot)
Permite silenciar el bot para un contacto específico, útil para chatear manualmente sin interferencias.

### 1️⃣7️⃣ Limpiar chats no-clientes (borrar/limpiar)
Limpia chats que no corresponden a clientes registrados.

### 1️⃣8️⃣ Listar clientes por plataforma
Muestra clientes agrupados por plataforma de servicio.

### 1️⃣9️⃣ Cambiar horario de atención
Permite actualizar el horario de atención del bot enviando un JSON con los horarios por día de la semana (0=Domingo, 1=Lunes, etc.).

### 2️⃣0️⃣ Pausar / reanudar bot
Permite pausar o reanudar el bot globalmente. Cuando está pausado, solo los admins pueden interactuar con el bot.

## Comandos de Texto Alternativos

Los administradores también pueden usar comandos con prefijo `*`:

- `*help` — Ver lista completa de comandos
- `*ping` — Healthcheck
- `*status` — Estado del bot
- `*cancelar` — Cancelar asistente actual
- `*runscheduler` — Ejecutar scheduler
- `*nuevo` — Crear cliente + suscripción
- `*detalles <telefono>` — Ver detalles de cliente
- `*yo` — Ver mis propios detalles
- `*comprobantes` — Listar comprobantes del día
- `*comprobante <telefono>` — Generar comprobante
- `*enviar <id>` — Enviar comprobante
- `*transacciones [telefono]` — Listar transacciones
- `*eliminar cliente <telefono>` — Eliminar cliente
- `*eliminar suscripcion <telefono>` — Eliminar suscripciones
- `*eliminar trans <id>` — Eliminar transacción

## Configuración

Los números de teléfono admin se configuran en la variable de entorno:

```bash
BOT_ADMIN_PHONES=50672140974,50612345678
```

## Salir

Para salir del menú admin o cancelar una operación:
- Escribe `salir`
- Escribe `*cancelar` (para asistentes activos)

## Notas

- El menú admin tiene prioridad sobre el menú de usuario normal
- Los comandos admin funcionan fuera del horario de atención
- Todas las operaciones de eliminación requieren confirmación explícita
- Los asistentes tienen timeout automático por inactividad (configurable)
