## Comportamiento actual del bot

Este documento resume el comportamiento operativo actual del bot de WhatsApp luego de los ajustes recientes de estabilidad y soporte.

### 1. Apertura del menú principal

- Si el chat está en estado normal (`idle`), cualquier mensaje de texto del usuario puede disparar el menú principal.
- Se aceptan variantes como `menu`, `inicio`, `help` y `menú`.
- El objetivo es evitar que el usuario quede sin respuesta útil cuando escribe un saludo o un mensaje corto.

### 2. Opción de agente

- La palabra `agente` activa el modo asesor.
- La opción `5` del menú también transfiere a agente.
- Cuando esto ocurre, el bot notifica al admin configurado y deja el chat en modo de atención humana.

### 3. Admin vs usuario normal

- Los administradores deben usar `adminmenu`, `admin` o `menuadmin` para el menú administrativo.
- Si un admin escribe un saludo normal, el bot no abre el menú de cliente automáticamente; devuelve una guía corta para usar `adminmenu` o `menu`.

### 4. Estado de cuenta

- La opción `8` consulta contratos y devuelve un resumen de estado de cuenta.
- El mensaje inicial de “consultando” se responde de forma inmediata para que el usuario vea actividad mientras se arma la respuesta.

### 5. Recepción de comprobantes

- La opción `6` deja el chat listo para recibir imagen o PDF.
- Si el archivo llega fuera del flujo esperado, el bot puede pedir confirmación antes de procesarlo.
- Luego solicita cuántos meses está pagando el cliente y registra esa información en backend.

### 6. Recordatorios y reintentos

- Si un cliente no tiene teléfono configurado, el reminder se marca como `failed` y ya no vuelve a `pending`.
- Esto evita ciclos de reintento infinitos para recordatorios imposibles de enviar.

### 7. Chats tipo @lid

- El bot ahora considera chats `@lid` en recepción porque varios mensajes reales llegan con ese identificador.
- Para envío, el bot intenta fallback a `@c.us` y otras resoluciones cuando WhatsApp Web falla al ubicar el chat.
- Aun así, esta parte depende del comportamiento de `whatsapp-web.js` y puede presentar fallos intermitentes externos al código de negocio.

### 8. Monitoreo recomendado

- Desde la UI: **Configuración del sistema → Logs**.
- Fuente recomendada: `PM2 bot output (ticobot-out.log)`.
- Filtro recomendado para soporte conversacional: `Solo WhatsApp entrante`.
- Para revisar estabilidad general, usar el filtro `Solo sistema`.
