# 🤖 TicoBOT - Sistema de Recordatorios WhatsApp

Sistema automatizado de recordatorios de pagos vía WhatsApp para gestión de clientes, contratos y cobros.

[![Laravel](https://img.shields.io/badge/Laravel-12-FF2D20?style=flat&logo=laravel)](https://laravel.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-Private-red)](LICENSE)

---

## 📋 Características

- ✅ **Gestión de Clientes y Contratos**: CRUD completo con React/Inertia
- ✅ **Recordatorios Automáticos**: Sistema de recordatorios programables con plantillas personalizables
- ✅ **Integración WhatsApp**: Bot automatizado con whatsapp-web.js
- ✅ **Gestión de Pagos**: Control de pagos, recibos y conciliaciones automáticas
- ✅ **Interfaz Moderna**: UI responsiva con React, TypeScript y Tailwind CSS
- ✅ **Sistema de Colas**: Procesamiento asíncrono con Laravel Queue
- ✅ **API REST**: Endpoints completos con Laravel Sanctum
- ✅ **Importación Masiva**: Soporte para CSV/XLSX de clientes y contratos
- ✅ **Dashboard Analítico**: Métricas en tiempo real de cobros y recordatorios
- ✅ **Logs en Tiempo Real**: Monitoreo desde la UI para eventos del sistema y actividad del bot WhatsApp
- ✅ **Multi-tenant**: Configuración por cliente con tipos de contrato personalizados

---

## 🧩 Configuración del mensaje de recordatorio (UI)

El contenido del recordatorio **ya no se arma con un mensaje hardcodeado en el bot**. Ahora se define desde la UI en:

**Configuración del sistema → General → “Plantilla global de recordatorio”**

### Campos

- **Nombre de la empresa (`company_name`)**: se usa como remitente dentro del mensaje (ej: *“TecnoServicios Artavia”*).
- **Plantilla global de recordatorio (`reminder_template`)**: es el texto completo que enviará el bot.

> Importante: la **plantilla es obligatoria**. Si está vacía, el bot no enviará recordatorios.

### Variables disponibles (placeholders)

Dentro de la plantilla podés insertar cualquiera de estas variables (incluyendo las llaves):

- `{client_name}`: nombre del cliente
- `{company_name}`: nombre de la empresa (remitente)
- `{due_date}`: fecha de vencimiento (formateada)
- `{amount}`: monto formateado con símbolo según moneda (₡ CRC / $ USD)
- `{services}`: servicios/planes (si el backend los incluye en el payload)
- `{contract_name}`: nombre del contrato
- `{payment_contact}`: Sinpe / contacto de pago (desde Settings)
- `{bank_accounts}`: cuentas bancarias (desde Settings)
- `{beneficiary_name}`: beneficiario (desde Settings)

### Ejemplo de plantilla

```text
{company_name}, le informa a {client_name} que:
Ha vencido el {due_date}
Servicios: {services}
Total: {amount}

Sinpemóvil: {payment_contact}
{bank_accounts}
Todas a nombre de {beneficiary_name}

Si ya canceló, omita el mensaje
```

---

## 📺 Monitoreo desde la UI

La pantalla de **Configuración del sistema** ahora incluye una pestaña **Logs** para observación operativa en tiempo real.

### Ubicación

- **Configuración del sistema → Logs**

### Qué se puede ver

- **Actividad del bot WhatsApp** desde la salida de PM2
- **Mensajes entrantes de WhatsApp** usando el filtro `Solo WhatsApp entrante`
- **Eventos del sistema** usando el filtro `Solo sistema`
- **Logs Laravel** y otros archivos configurados como fuente

### Fuentes disponibles

- `PM2 bot output (ticobot-out.log)`
- `PM2 bot errors (ticobot-error.log)`
- `Bot local (bot/log.out)`
- `Laravel (storage/logs/laravel.log)`

### Notas operativas

- La vista usa recarga automática corta para simular tiempo real sin mantener conexiones abiertas persistentes.
- La fuente por defecto está configurada para abrir en **PM2 bot output**, ya que es la más útil para soporte del bot en producción.
- Los filtros rápidos permiten separar la conversación entrante de WhatsApp de eventos generales del sistema.

---

## 🛠️ Stack Tecnológico

### Backend
- **Laravel 12** - Framework PHP moderno
- **SQLite/MySQL** - Base de datos (SQLite por defecto para desarrollo)
- **Laravel Sanctum** - Autenticación API
- **Laravel Inertia** - SSR sin API tradicional
- **PhpSpreadsheet** - Procesamiento de archivos Excel
- **DomPDF** - Generación de PDFs

### Frontend
- **React 18** - Librería UI reactiva
- **TypeScript** - Tipado estático
- **Inertia.js** - Stack moderno full-stack
- **Tailwind CSS** - Framework CSS utility-first
- **Vite** - Build tool ultrarrápido
- **Headless UI** - Componentes accesibles

### Bot WhatsApp
- **Node.js 18+** - Runtime JavaScript
- **TypeScript** - Desarrollo tipado
- **whatsapp-web.js** - Cliente WhatsApp no oficial
- **Puppeteer** - Headless browser para WhatsApp Web
- **Axios** - Cliente HTTP para API Laravel

---

## 📦 Requisitos del Sistema

### Requisitos Mínimos
- **PHP** >= 8.2 con extensiones: `curl`, `mbstring`, `xml`, `sqlite3` (o `mysql`), `gd`, `zip`
- **Node.js** >= 18.x
- **Composer** >= 2.x
- **npm** o **pnpm** >= 8.x
- **Apache/Nginx** con `mod_rewrite` habilitado

### Requisitos Recomendados para Producción
- **PHP** 8.3+
- **MySQL** 8.0+ (en lugar de SQLite)
- **Redis** para cache y colas
- **Supervisor** para queue workers
- **PM2** para el bot WhatsApp
- **Certbot** para certificados SSL
- **2GB RAM** mínimo (4GB+ recomendado)

---

## 🚀 Guía de Instalación Completa

> Esta guía cubre:
> 1) descargar el software,
> 2) instalar dependencias,
> 3) publicarlo con Apache,
> 4) configurar los datos de la empresa y el mensaje desde la UI.

### Paso 1: Clonar el Repositorio

```bash
git clone git@github.com:tecnoserviciosartavia/ticobot.git
cd ticobot
```

### Paso 2: Configurar Backend Laravel

#### 2.1 Instalar Dependencias PHP

```bash
# Instalar dependencias de Composer
composer install

# Si no tienes Composer instalado:
# curl -sS https://getcomposer.org/installer | php
# sudo mv composer.phar /usr/local/bin/composer
```

#### 2.2 Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Generar clave de aplicación
php artisan key:generate
```

#### 2.3 Editar `.env` con tu configuración

```env
# Configuración General
APP_NAME="TicoBOT"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://ticocast.com  # ⚠️ Importante: tu dominio real

# Base de Datos (SQLite por defecto, cambiar a MySQL si prefieres)
DB_CONNECTION=sqlite
# Para MySQL:
# DB_CONNECTION=mysql
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_DATABASE=ticobot
# DB_USERNAME=root
# DB_PASSWORD=

# Colas (database para simplicidad, redis para producción)
QUEUE_CONNECTION=database

# Cache
CACHE_STORE=file
# CACHE_STORE=redis  # Recomendado para producción

# Sesión
SESSION_DRIVER=database
SESSION_LIFETIME=120

# Mail (configurar según tu proveedor)
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=tu-email@gmail.com
MAIL_PASSWORD=tu-app-password
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@ticocast.com
MAIL_FROM_NAME="${APP_NAME}"
```

#### 2.4 Crear Base de Datos y Ejecutar Migraciones

```bash
# Si usas SQLite (por defecto)
touch database/database.sqlite

# Ejecutar migraciones
php artisan migrate

# (Opcional) Cargar datos de prueba
php artisan db:seed
```

#### 2.5 Crear Usuario Administrador

```bash
php artisan tinker
```

Dentro de tinker:
```php
User::factory()->create([
    'name' => 'Administrador',
    'email' => 'admin@ticocast.com',
    'password' => Hash::make('tu-contraseña-segura')
]);
exit
```

### Paso 3: Configurar Frontend (React + Vite)

```bash
# Instalar dependencias de Node.js
npm install

# Si prefieres pnpm:
# npm install -g pnpm
# pnpm install

# Compilar assets para producción
npm run build

# Para desarrollo (con hot reload):
# npm run dev
```

### Paso 4: Configurar Bot de WhatsApp

#### 4.1 Instalar Dependencias del Bot

```bash
cd bot
npm install
cd ..
```

#### 4.2 Generar Token de API

```bash
php artisan tinker
```

Dentro de tinker:
```php
$user = User::first();
$token = $user->createToken('bot-token')->plainTextToken;
echo "Token: " . $token . "\n";
exit
```

**⚠️ Copia el token generado, lo necesitarás en el siguiente paso.**

#### 4.3 Configurar Variables del Bot

```bash
cd bot
cp .env.example .env
```

Editar `bot/.env`:
```env
# URL de tu API Laravel
BOT_API_BASE_URL=https://ticocast.com/api

# Token generado en el paso anterior
BOT_API_TOKEN=1|abcdef123456...

# Configuración de polling (milisegundos)
BOT_POLL_INTERVAL_MS=30000

# Minutos de anticipación para envío
BOT_LOOK_AHEAD_MINUTES=30

# Código de país (Costa Rica = 506)
BOT_DEFAULT_COUNTRY_CODE=506
```

#### 4.4 Compilar Bot TypeScript

```bash
# Dentro de bot/
npm run build

# Volver al directorio raíz
cd ..
```

#### 4.5 (Recomendado Producción) Ejecutar el bot con PM2

En servidores sin interfaz gráfica (sin X server), el bot debe correr en modo **headless**.

1) Asegúrate de tener en `bot/.env`:

```env
# Importante en servidores sin GUI
BOT_HEADLESS=true
```

2) Inicia el bot con PM2 desde la raíz del repo:

```bash
# Construye el bot
cd bot
npm run build

# Vuelve a la raíz e inicia con PM2
cd ..
pm2 start bot/dist/index.js --name ticobot --cwd ./bot --update-env
```

3) Ver logs y estado:

```bash
pm2 status
pm2 logs ticobot
```

4) Reiniciar tras cambios:

```bash
pm2 restart ticobot --update-env
```

5) Persistir procesos tras reinicio del servidor:

```bash
pm2 save
```

Notas:
- En este entorno productivo el proceso operativo principal del bot es `ticobot`.
- `pm2 status` lista *todos* los procesos del usuario (por ejemplo `ticobot`, `ticobot_2` u otros procesos históricos).
- El bot usa `BOT_SESSION_PATH` (por defecto `storage/whatsapp-session`). Evita correr dos bots apuntando a la misma ruta de sesión.
- No pegues tokens reales en documentación; usa valores de ejemplo.

### Estabilidad reciente del bot WhatsApp

Se aplicaron varios ajustes para reducir silencios del bot y mejorar la operación con WhatsApp Web:

- Soporte operativo para chats tipo `@lid` en recepción, manteniendo fallback para envíos.
- Promoción de estado `CONNECTED` a listo cuando `ready` no llega pero el cliente ya es usable.
- Fallback de envío para intentar múltiples targets cuando WhatsApp Web no resuelve el chat a la primera.
- Cleanup de sesión endurecido para evitar warnings falsos al cerrar Chromium/Puppeteer.

Importante:

- Aun con estos cambios, `whatsapp-web.js` y Puppeteer siguen siendo una dependencia frágil ante cambios de WhatsApp Web.
- Si el bot deja de responder, la primera revisión recomendada es **Configuración → Logs** con fuente `PM2 bot output` y filtro `Solo WhatsApp entrante`.

### Paso 5: Configurar Servidor Web

Tienes dos opciones principales: **servidor local** (desarrollo) o **Apache/Nginx** (producción).

#### Opción A: Servidor de Desarrollo (Local)

```bash
# Método 1: Script integrado (recomendado)
composer dev
# Esto inicia: servidor Laravel, queue worker, logs y Vite simultáneamente

# Método 2: Comandos individuales en terminales separadas
# Terminal 1:
php artisan serve

# Terminal 2:
php artisan queue:listen

# Terminal 3:
npm run dev

# Terminal 4 (Bot WhatsApp):
cd bot && npm run dev
```

Accede a: `http://localhost:8000`

#### Opción B: Apache/Nginx (Producción)

**📖 Para configuración detallada de proxy inverso, consulta [PROXY_SETUP.md](PROXY_SETUP.md)**

##### Apache - Configuración Básica

Crear `/etc/apache2/sites-available/ticobot.conf`:

```apache
<VirtualHost *:80>
    ServerName ticocast.com
    ServerAlias www.ticocast.com
    DocumentRoot /home/fabian/ticobot/public

    <Directory /home/fabian/ticobot/public>
        AllowOverride All
        Require all granted
        Options -Indexes +FollowSymLinks
        
        # Laravel rewrite
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteRule ^ index.php [L]
    </Directory>

    # Confiar en cabeceras de proxy (si aplica)
    SetEnvIf X-Forwarded-Proto https HTTPS=on

    ErrorLog ${APACHE_LOG_DIR}/ticobot-error.log
    CustomLog ${APACHE_LOG_DIR}/ticobot-access.log combined
</VirtualHost>
```

Activar sitio:
```bash
# Habilitar módulos necesarios
sudo a2enmod rewrite headers

# Habilitar sitio
sudo a2ensite ticobot.conf

# Verificar configuración
sudo apache2ctl configtest

# Reiniciar Apache
sudo systemctl restart apache2
```

##### Apache - Publicar el sistema (checklist rápido)

Antes de dar por listo el sitio en Apache, revisa:

- **DocumentRoot** debe apuntar a `.../ticobot/public` (no a la raíz del proyecto).
- `AllowOverride All` para que funcione `.htaccess`.
- `mod_rewrite` y `headers` habilitados.
- `APP_URL` en `.env` debe ser el dominio final (https si aplica).
- Permisos de `storage/` y `bootstrap/cache/` (ver Paso 6).
- Assets compilados: existe `public/build/manifest.json` (ver Paso 7).

Si cambiaste el dominio o la ruta, ejecuta:

- `php artisan config:clear`
- `php artisan route:clear`
- `php artisan view:clear`

##### Nginx - Configuración Básica

Crear `/etc/nginx/sites-available/ticobot`:

```nginx
server {
    listen 80;
    server_name ticocast.com www.ticocast.com;
    root /home/fabian/ticobot/public;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    error_page 404 /index.php;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

Activar sitio:
```bash
sudo ln -s /etc/nginx/sites-available/ticobot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Paso 6: Configurar Permisos de Archivos

```bash
# Cambiar propietario a usuario del servidor web
sudo chown -R www-data:www-data storage bootstrap/cache
# En algunos sistemas puede ser: nginx:nginx o apache:apache

# Dar permisos de escritura
sudo chmod -R ug+rwx storage bootstrap/cache

# Asegurar que public/ sea legible
sudo chmod -R 755 public
```

### Paso 7: Optimizar para Producción

```bash
# Limpiar caches anteriores
php artisan optimize:clear

# Generar caches optimizados
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Compilar assets finales
npm run build
```

### Paso 8: Configurar Queue Worker (Producción)

---

## 🏢 Configurar empresas (remitente, pagos y mensaje) desde la UI

En TicoBOT, lo que usualmente llamamos “empresa” (remitente) **se configura desde la UI**. Esto controla el nombre que aparece en los recordatorios y el contenido completo del mensaje.

1) Inicia sesión en el panel.

2) Ve a:

**Configuración del sistema → General**

3) Completa estos campos:

- **Nombre de la empresa** (`company_name`): se usa dentro de la plantilla con `{company_name}`.
- **Plantilla global de recordatorio** (`reminder_template`): mensaje completo que enviará el bot.
- **Sinpe / contacto de pago** (`payment_contact`): se usa con `{payment_contact}`.
- **Cuentas bancarias** (`bank_accounts`): se usa con `{bank_accounts}`.
- **Beneficiario** (`beneficiary_name`): se usa con `{beneficiary_name}`.

Notas importantes:

- La **plantilla es obligatoria**. Si está vacía, el bot no enviará recordatorios.
- La plantilla acepta **placeholders** como `{client_name}`, `{due_date}`, `{amount}`, etc. (ver sección “Configuración del mensaje de recordatorio (UI)”).

### Enviar un recordatorio de prueba (sin tinker)

En la misma pantalla **Configuración del sistema → General**, encontrarás:

**“Enviar recordatorio de prueba”**

Ahí podés ingresar un número (ej. `61784023` o `50661784023`) y presionar **Enviar prueba**.

Esto encola un recordatorio inmediato en estado `pending`, y el bot lo enviará cuando haga el siguiente ciclo de polling.

---

## 🧾 Nota sobre multi-empresa / multi-tenant

Actualmente, la configuración de `company_name` y `reminder_template` es **global** (aplica a todo el sistema). Si en el futuro necesitás manejar múltiples empresas con configuraciones distintas, hay que extender el modelo para guardar settings por “tenant/empresa” y hacer que el bot consulte settings por tenant.

#### Opción A: Supervisor (Recomendado)

Crear `/etc/supervisor/conf.d/ticobot-worker.conf`:

```ini
[program:ticobot-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /home/fabian/ticobot/artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/home/fabian/ticobot/storage/logs/worker.log
stopwaitsecs=3600
```

Activar:
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start ticobot-worker:*
```

#### Opción B: systemd

Crear `/etc/systemd/system/ticobot-queue.service`:

```ini
[Unit]
Description=TicoBOT Queue Worker
After=network.target

[Service]
User=www-data
Group=www-data
Restart=always
ExecStart=/usr/bin/php /home/fabian/ticobot/artisan queue:work --sleep=3 --tries=3

[Install]
WantedBy=multi-user.target
```

Activar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ticobot-queue
sudo systemctl start ticobot-queue
```

### Paso 9: Iniciar Bot WhatsApp (Producción)

#### Con PM2 (Recomendado)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar bot
cd /home/fabian/ticobot/bot
pm2 start dist/index.js --name ticobot-bot

# Configurar inicio automático
pm2 startup
pm2 save

# Ver logs
pm2 logs ticobot-bot

# Reiniciar
pm2 restart ticobot-bot
```

#### Con systemd

Crear `/etc/systemd/system/ticobot-bot.service`:

```ini
[Unit]
Description=TicoBOT WhatsApp Bot
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/fabian/ticobot/bot
ExecStart=/usr/bin/node /home/fabian/ticobot/bot/dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Activar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable ticobot-bot
sudo systemctl start ticobot-bot
sudo systemctl status ticobot-bot
```

### Paso 10: Vincular WhatsApp

1. Accede a tu aplicación: `https://ticocast.com`
2. Inicia sesión con las credenciales del administrador
3. Ve a **Configuración** o **Perfil**
4. El sistema generará automáticamente un código QR
5. Abre WhatsApp en tu teléfono → **Menú (⋮)** → **Dispositivos vinculados**
6. Escanea el código QR
7. El estado cambiará a **"Conectado"** ✅

---

## 🔧 Configuración de Proxy Inverso

Si tu arquitectura usa un **servidor proxy** apuntando a este backend (común en setups con múltiples aplicaciones o balanceo de carga), Laravel necesita configuración especial para detectar correctamente HTTPS, host y la IP real del cliente.

### Problema Común: Página en Blanco con Proxy

Cuando accedes al dominio y ves una página en blanco, generalmente se debe a:

1. **Middleware TrustProxies no configurado** → Laravel no reconoce cabeceras `X-Forwarded-*`
2. **APP_URL incorrecto** → Assets (CSS/JS) cargan con URL errónea
3. **DocumentRoot mal apuntado** → Servidor sirve carpeta incorrecta
4. **Permisos insuficientes** → Laravel no puede escribir logs/cache

### Solución Implementada

Este proyecto ya incluye:

✅ **Middleware `TrustProxies`** configurado en `app/Http/Middleware/TrustProxies.php`  
✅ **Middleware registrado** en `bootstrap/app.php`  
✅ **Script de diagnóstico** `scripts/diagnose_proxy.php`  
✅ **Documentación completa** en `PROXY_SETUP.md`

### Quick Start para Proxy Inverso

#### 1. Actualizar `.env` en el Backend

```env
APP_URL=https://ticocast.com  # ⚠️ Dominio público real
```

```bash
php artisan config:clear
```

#### 2. Configurar Apache en Servidor Proxy

```apache
<VirtualHost *:443>
    ServerName ticocast.com
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/ticocast.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/ticocast.com/privkey.pem
    
    ProxyPreserveHost On
    ProxyPass / http://192.168.20.190:80/
    ProxyPassReverse / http://192.168.20.190:80/
    
    # Cabeceras críticas para Laravel
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"
</VirtualHost>
```

**⚠️ Reemplaza `192.168.20.190` con la IP real de tu servidor backend.**

#### 3. Habilitar Módulos de Proxy

```bash
# En servidor proxy
sudo a2enmod proxy proxy_http headers ssl
sudo systemctl restart apache2
```

#### 4. Ejecutar Diagnóstico

```bash
# En servidor backend
php scripts/diagnose_proxy.php
```

Este script verifica:
- ✅ Configuración de Laravel (`APP_URL`, `APP_ENV`)
- ✅ Middleware `TrustProxies` instalado
- ✅ Permisos de `storage/` y `bootstrap/cache/`
- ✅ Assets compilados (`build/manifest.json`)
- ✅ Apache escuchando en el puerto correcto

### Documentación Completa de Proxy

Para arquitecturas avanzadas, balanceo de carga, múltiples proxies o configuración Nginx, consulta:

**📖 [PROXY_SETUP.md](PROXY_SETUP.md)** - Guía completa paso a paso

Incluye:
- Configuración Apache backend
- Configuración Apache/Nginx proxy
- Certificados SSL con Let's Encrypt
- Troubleshooting de errores comunes
- Monitoreo y logs
- Seguridad y firewall

---

## 🎯 Uso y Comandos

### Modo Desarrollo

#### Iniciar Todos los Servicios (Recomendado)

```bash
# Inicia: servidor Laravel, queue worker, logs y Vite simultáneamente
composer dev
```

Esto ejecuta en paralelo:
- ✅ Servidor Laravel en `http://localhost:8000`
- ✅ Queue Worker procesando recordatorios
- ✅ Vite Dev Server con hot reload
- ✅ Logs en tiempo real

#### Comandos Individuales (Alternativa)

```bash
# Terminal 1 - Servidor Laravel
php artisan serve

# Terminal 2 - Queue Worker (procesa recordatorios)
php artisan queue:listen

# Terminal 3 - Frontend con hot reload
npm run dev

# Terminal 4 - Bot WhatsApp
cd bot && npm run dev
```

### Modo Producción

Ya configurado en **Paso 8** y **Paso 9** de instalación con Supervisor/PM2.

#### Comandos de Mantenimiento

```bash
# Ver estado de queue workers
sudo supervisorctl status ticobot-worker:*

# Reiniciar workers
sudo supervisorctl restart ticobot-worker:*

# Ver estado del bot
pm2 status ticobot-bot

# Ver logs del bot
pm2 logs ticobot-bot --lines 100

# Reiniciar bot
pm2 restart ticobot-bot
```

---

## 📊 Estructura del Proyecto

```
ticobot/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Api/              # API para bot WhatsApp
│   │   │   │   ├── BotMenuController.php
│   │   │   │   ├── ReminderController.php
│   │   │   │   └── WhatsAppController.php
│   │   │   └── Web/              # Controladores web (Inertia)
│   │   │       ├── ClientController.php
│   │   │       ├── ContractController.php
│   │   │       ├── PaymentController.php
│   │   │       ├── ReminderController.php
│   │   │       └── DashboardController.php
│   │   ├── Middleware/
│   │   │   ├── HandleInertiaRequests.php
│   │   │   └── TrustProxies.php  # ⭐ Soporte proxy inverso
│   │   └── Requests/
│   ├── Models/                   # Modelos Eloquent
│   │   ├── Client.php
│   │   ├── Contract.php
│   │   ├── Payment.php
│   │   ├── Reminder.php
│   │   ├── ReminderMessage.php
│   │   └── User.php
│   ├── Observers/
│   │   └── ContractObserver.php  # Genera recordatorios automáticamente
│   ├── Services/
│   │   ├── WhatsAppNotificationService.php
│   │   └── ConciliationPdfService.php
│   └── Support/
│       └── WhatsAppStatus.php
├── bot/                          # Bot WhatsApp (Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts              # Punto de entrada
│   │   ├── api-client.ts         # Cliente API Laravel
│   │   ├── whatsapp-client.ts    # Cliente WhatsApp
│   │   └── reminder-processor.ts # Procesador de recordatorios
│   ├── storage/                  # Sesión de WhatsApp
│   ├── package.json
│   └── tsconfig.json
├── config/                       # Configuración Laravel
│   ├── app.php
│   ├── database.php
│   ├── queue.php
│   └── reminders.php             # ⭐ Config personalizada recordatorios
├── database/
│   ├── migrations/               # Migraciones de BD
│   ├── factories/                # Factories para testing
│   └── seeders/
├── resources/
│   ├── js/
│   │   ├── Components/           # Componentes React reutilizables
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── Pagination.tsx
│   │   │   └── WhatsAppConnectionCard.tsx
│   │   ├── Layouts/
│   │   │   ├── AuthenticatedLayout.tsx
│   │   │   └── GuestLayout.tsx
│   │   ├── Pages/                # Páginas Inertia
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Clients/
│   │   │   ├── Contracts/
│   │   │   ├── Reminders/
│   │   │   ├── Payments/
│   │   │   └── Auth/
│   │   └── app.tsx               # Entrada React
│   ├── css/
│   │   └── app.css
│   └── views/
│       ├── app.blade.php         # Layout base Inertia
│       └── pdf/                  # Plantillas PDF
├── routes/
│   ├── web.php                   # Rutas web autenticadas
│   ├── api.php                   # ⭐ API para bot WhatsApp
│   ├── auth.php                  # Rutas de autenticación
│   └── console.php
├── scripts/                      # ⭐ Scripts CLI de utilidad
│   ├── diagnose_proxy.php        # Diagnóstico de proxy inverso
│   ├── check_conciliations.php
│   ├── export_cobradorapp_customers.php
│   └── simulate_conciliation_api.php
├── storage/
│   ├── app/
│   ├── logs/
│   └── framework/
├── public/                       # Documentroot del servidor
│   ├── index.php
│   └── build/                    # Assets compilados por Vite
├── .env                          # ⚠️ Variables de entorno (no versionado)
├── .env.example                  # Plantilla de .env
├── composer.json                 # Dependencias PHP
├── package.json                  # Dependencias Node.js
├── vite.config.js                # Configuración Vite
├── tailwind.config.js            # Configuración Tailwind CSS
├── tsconfig.json                 # Configuración TypeScript
├── PROXY_SETUP.md                # ⭐ Guía completa de proxy inverso
└── README.md                     # Este archivo
```

---

## 🗄️ Gestión de Base de Datos

### Comandos Estándar Laravel

```bash
# Crear base de datos desde cero
php artisan migrate:fresh

# Crear BD con datos de prueba
php artisan migrate:fresh --seed

# Ejecutar solo migraciones pendientes
php artisan migrate

# Revertir última migración
php artisan migrate:rollback

# Revertir todas las migraciones
php artisan migrate:reset

# Ver estado de migraciones
php artisan migrate:status
```

### Comandos Personalizados de Limpieza

```bash
# Limpiar recordatorios enviados (>30 días)
php artisan db:clean:reminders

# Limpiar mensajes de recordatorios antiguos
php artisan db:clean:messages

# Limpiar pagos sin confirmar (>60 días)
php artisan db:clean:payments

# Limpiar recibos huérfanos
php artisan db:clean:receipts

# Limpieza completa manteniendo usuarios y clientes activos
php artisan db:clean:all --keep-users --keep-clients
```

### Importación Masiva

#### Importar Clientes desde CSV

1. Ve a **Clientes** → **Importar**
2. Descarga plantilla CSV de ejemplo
3. Rellena con tus datos:
   ```csv
   nombre,telefono,email,direccion,identificacion
   Juan Pérez,88887777,juan@example.com,San José,1-0234-0567
   ```
4. Sube el archivo
5. Revisa vista previa y confirma

#### Importar Contratos desde XLSX/CSV

1. Ve a **Contratos** → **Importar**
2. Descarga plantilla Excel
3. Formato esperado:
   ```
   telefono_cliente | nombre_cliente | numero_contrato | tipo_contrato | monto | fecha_inicio | fecha_vencimiento
   ```
4. Sube archivo
5. El sistema crea clientes automáticamente si no existen

---

## 📱 Gestión de Recordatorios

### Crear Recordatorio Manual

1. Ve a **Recordatorios** → **Crear**
2. Selecciona **Contrato** (se autocompletará cliente y teléfono)
3. Configura:
   - **Fecha/Hora programada**
   - **Mensaje personalizado** (usa variables: `{cliente}`, `{monto}`, `{fecha}`)
   - **Estado**: Programado/Enviado/Cancelado
4. Guarda

### Variables Disponibles en Mensajes

Puedes usar estas variables en plantillas de recordatorios:

- `{cliente}` → Nombre del cliente
- `{monto}` → Monto del contrato
- `{fecha}` → Fecha de vencimiento
- `{contrato}` → Número de contrato
- `{empresa}` → Nombre de tu empresa (config)

**Ejemplo:**
```
Hola {cliente}, te recordamos que tu pago de ₡{monto} 
del contrato {contrato} vence el {fecha}. 
Gracias por tu puntualidad.
```

### Recordatorios Automáticos

Los recordatorios se generan automáticamente cuando:

1. **Creas o editas un contrato** → `ContractObserver` genera recordatorios según configuración
2. **Fechas configurables** en `config/reminders.php`:
   - 7 días antes de vencimiento
   - 3 días antes
   - Día del vencimiento
   - 3 días después (recordatorio de mora)

Editar recordatorios automáticos:

```php
// config/reminders.php
return [
    'enabled' => true,
    'days_before' => [7, 3, 0],  // -7, -3, 0 días
    'days_after' => [3],          // +3 días (mora)
];
```

---

## 🔐 API REST (Laravel Sanctum)

### Autenticación

Todas las rutas `/api/*` requieren token de Sanctum.

#### Generar Token

```bash
php artisan tinker
```

```php
$user = User::find(1);
$token = $user->createToken('nombre-aplicacion')->plainTextToken;
echo $token;
```

#### Usar Token en Requests

```bash
curl -H "Authorization: Bearer TU_TOKEN_AQUI" \
     https://ticocast.com/api/reminders/pending
```

### Endpoints Principales

#### WhatsApp Bot

```http
GET  /api/whatsapp/status
POST /api/whatsapp/status
```

#### Recordatorios

```http
GET  /api/reminders/pending         # Recordatorios pendientes (próximos 30min)
POST /api/reminders/{id}/mark-sent  # Marcar como enviado
```

#### Menú Bot

```http
GET /api/bot-menu                   # Opciones de menú del bot
```

Documentación completa de API: `routes/api.php`

---

## 🔒 Seguridad

### Checklist de Producción

- ✅ Cambiar `APP_KEY` (ejecutar `php artisan key:generate`)
- ✅ Configurar `APP_ENV=production`
- ✅ Configurar `APP_DEBUG=false`
- ✅ Usar **HTTPS** obligatorio (certificado SSL con Let's Encrypt)
- ✅ Rotar tokens de API regularmente
- ✅ Configurar **CORS** si tienes frontend separado
- ✅ Habilitar **firewall** (`ufw` o `firewalld`)
- ✅ Actualizar dependencias: `composer update`, `npm update`
- ✅ Configurar **rate limiting** en rutas sensibles
- ✅ Habilitar **2FA** para usuarios administradores (si implementado)
- ✅ Backups automáticos de base de datos

### Protección de Archivos Sensibles

Asegúrate de que `.env`, `storage/`, `bootstrap/cache/` **NO** sean accesibles públicamente.

Apache ya incluye `.htaccess` en `public/`.  
Para Nginx, verifica regla `deny all` en `location ~ /\.`.

### Firewall UFW (Ubuntu)

```bash
# Denegar todo por defecto
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permitir SSH
sudo ufw allow 22/tcp

# Permitir HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Si usas proxy, solo permitir tráfico desde IP del proxy
# sudo ufw allow from 203.0.113.50 to any port 80

# Activar firewall
sudo ufw enable

# Ver estado
sudo ufw status verbose
```

---

## 🧪 Testing

```bash
# Ejecutar todos los tests
php artisan test

# Tests con coverage HTML
php artisan test --coverage --coverage-html=coverage

# Tests específicos por clase
php artisan test --filter=ClientTest

# Tests específicos por método
php artisan test --filter=test_client_can_be_created

# Tests en paralelo (más rápido)
php artisan test --parallel
```

### Crear Nuevos Tests

```bash
# Test de feature
php artisan make:test ClientControllerTest

# Test unitario
php artisan make:test --unit ClientModelTest
```

---

## 🛠️ Comandos Artisan Útiles

### Cachés

```bash
# Limpiar TODO (config, routes, views, cache)
php artisan optimize:clear

# Cachear config (producción)
php artisan config:cache

# Cachear rutas (producción)
php artisan route:cache

# Cachear vistas (producción)
php artisan view:cache

# Limpiar cachés individualmente
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear
```

### Mantenimiento

```bash
# Poner aplicación en modo mantenimiento
php artisan down --secret="bypass-token"
# Acceso: https://ticocast.com/bypass-token

# Salir de modo mantenimiento
php artisan up
```

### Información del Sistema

```bash
# Ver info completa de Laravel
php artisan about

# Listar todas las rutas
php artisan route:list

# Listar rutas filtradas
php artisan route:list --path=api

# Ver configuración actual
php artisan config:show app
php artisan config:show database
```

### Queue/Jobs

```bash
# Procesar queue una vez
php artisan queue:work --once

# Procesar con timeout
php artisan queue:work --timeout=60

# Limpiar jobs fallidos
php artisan queue:flush

# Reintentar jobs fallidos
php artisan queue:retry all

# Ver jobs fallidos
php artisan queue:failed
```

---

## 🐛 Troubleshooting (Solución de Problemas)

### 1. Página en Blanco / Error 500

**Diagnóstico:**
```bash
# Ver últimos logs de Laravel
tail -n 100 storage/logs/laravel.log

# Activar debug temporal
# En .env:
APP_DEBUG=true
php artisan config:clear

# Verificar permisos
ls -la storage/ bootstrap/cache/
```

**Soluciones comunes:**
```bash
# Arreglar permisos
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R ug+rwx storage bootstrap/cache

# Regenerar caches
php artisan optimize:clear
php artisan config:cache
```

### 2. Bot WhatsApp No Genera QR

**Diagnóstico:**
```bash
# Ver logs del bot
pm2 logs ticobot-bot

# Verificar permisos de storage
ls -la bot/storage/
```

**Soluciones:**
```bash
# Limpiar sesión de WhatsApp
cd bot
rm -rf .wwebjs_cache .wwebjs_auth storage/*

# Dar permisos
chmod -R 755 storage

# Reiniciar bot
pm2 restart ticobot-bot
```

### 3. Assets (CSS/JS) No Cargan / Error 404

**Diagnóstico:**
```bash
# Verificar que exista manifest
ls -lh public/build/manifest.json

# Ver URL en navegador (F12 → Network)
# ¿Intenta cargar desde http en vez de https?
```

**Soluciones:**
```bash
# Recompilar assets
npm run build

# Verificar APP_URL en .env
# Debe ser: APP_URL=https://ticocast.com
php artisan config:clear

# Limpiar cache del navegador (Ctrl+Shift+R)
```

### 4. Error "SQLSTATE[HY000] [14] unable to open database file"

**Problema:** SQLite no encuentra el archivo o no tiene permisos.

**Solución:**
```bash
# Crear archivo si no existe
touch database/database.sqlite

# Dar permisos
chmod 664 database/database.sqlite
sudo chown www-data:www-data database/database.sqlite

# O cambiar a MySQL en .env:
DB_CONNECTION=mysql
DB_DATABASE=ticobot
# ...
php artisan migrate
```

### 5. Queue Worker No Procesa Jobs

**Diagnóstico:**
```bash
# Ver jobs en cola
php artisan queue:work --once

# Ver tabla jobs
php artisan tinker
>>> \DB::table('jobs')->count();
```

**Soluciones:**
```bash
# Reiniciar supervisor
sudo supervisorctl restart ticobot-worker:*

# Verificar configuración de queue
php artisan config:show queue

# Limpiar jobs atascados
php artisan queue:flush
```

### 6. Proxy Inverso: Redireccionamiento Infinito o Mixed Content

**Diagnóstico:**
```bash
# Ejecutar diagnóstico
php scripts/diagnose_proxy.php

# Verificar cabeceras recibidas
# Acceder a: https://ticocast.com/up con inspector de red
```

**Soluciones:**

1. Verificar `TrustProxies` configurado (ya hecho en este proyecto)
2. Asegurar que proxy envíe cabeceras:
   ```apache
   RequestHeader set X-Forwarded-Proto "https"
   RequestHeader set X-Forwarded-Port "443"
   ```
3. Limpiar caches:
   ```bash
   php artisan config:clear
   ```

**📖 Ver documentación completa:** [PROXY_SETUP.md](PROXY_SETUP.md)

### 7. Error "Class 'Redis' not found"

Si usas `QUEUE_CONNECTION=redis` pero no tienes extensión PHP Redis:

**Solución:**
```bash
# Instalar extensión phpredis
sudo apt install php8.2-redis
sudo systemctl restart apache2

# O cambiar a database queue en .env:
QUEUE_CONNECTION=database
php artisan config:clear
```

### 8. Error "Vite manifest not found"

```bash
# Compilar assets
npm install
npm run build

# Si persiste, limpiar node_modules
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📝 Variables de Entorno Importantes

### Laravel Principal (`.env`)

```env
# ==================== GENERAL ====================
APP_NAME="TicoBOT"
APP_ENV=production              # local | production
APP_DEBUG=false                 # true en desarrollo, false en producción
APP_URL=https://ticocast.com    # ⚠️ URL completa con https://

# ==================== BASE DE DATOS ====================
DB_CONNECTION=sqlite            # sqlite | mysql
# Para SQLite (por defecto):
# DB_DATABASE=/ruta/absoluta/database/database.sqlite

# Para MySQL:
# DB_CONNECTION=mysql
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_DATABASE=ticobot
# DB_USERNAME=root
# DB_PASSWORD=contraseña_segura

# ==================== CACHE Y SESIÓN ====================
CACHE_STORE=file                # file | redis | database
SESSION_DRIVER=database         # file | cookie | database | redis
SESSION_LIFETIME=120            # Minutos

# ==================== COLAS ====================
QUEUE_CONNECTION=database       # sync | database | redis
# sync = sin cola (desarrollo)
# database = recomendado para producción pequeña
# redis = recomendado para alta carga

# ==================== REDIS (Opcional) ====================
# REDIS_CLIENT=phpredis
# REDIS_HOST=127.0.0.1
# REDIS_PASSWORD=null
# REDIS_PORT=6379

# ==================== CORREO ====================
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=tu-email@gmail.com
MAIL_PASSWORD=tu-app-password
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@ticocast.com
MAIL_FROM_NAME="${APP_NAME}"

# ==================== WHATSAPP (Opcional) ====================
# WHATSAPP_BUSINESS_ACCOUNT_ID=
# WHATSAPP_PHONE_NUMBER_ID=
# WHATSAPP_ACCESS_TOKEN=

# ==================== LOGGING ====================
LOG_CHANNEL=stack
LOG_LEVEL=info                  # debug | info | warning | error
```

### Bot WhatsApp (`bot/.env`)

```env
# URL base de tu API Laravel
BOT_API_BASE_URL=https://ticocast.com/api

# Token Sanctum (generado con: php artisan tinker)
BOT_API_TOKEN=1|abcdefghijklmnopqrstuvwxyz123456

# Intervalo de polling en milisegundos (30 segundos = 30000)
BOT_POLL_INTERVAL_MS=30000

# Minutos de anticipación para enviar recordatorios
BOT_LOOK_AHEAD_MINUTES=30

# Código de país para números sin prefijo (Costa Rica = 506)
BOT_DEFAULT_COUNTRY_CODE=506

# Modo debug (opcional)
NODE_ENV=production             # development | production
```

---

## 📞 Soporte y Contribuciones

### Reportar Bugs

Si encuentras un error:

1. Verifica que no esté reportado en **Issues** de GitHub
2. Incluye en tu reporte:
   - Versión de PHP (`php -v`)
   - Versión de Node.js (`node -v`)
   - Sistema operativo
   - Logs relevantes (`storage/logs/laravel.log`)
   - Pasos para reproducir el error
3. Crea un **Issue** en GitHub con toda la información

### Solicitar Features

Para nuevas funcionalidades:

1. Describe el caso de uso
2. Explica el beneficio esperado
3. Si es posible, sugiere implementación
4. Crea un **Issue** con etiqueta `enhancement`

### Contribuir Código

1. Fork del repositorio
2. Crea branch para tu feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit con mensajes descriptivos
4. Push a tu fork
5. Abre Pull Request con descripción detallada

**Guías de estilo:**
- PSR-12 para PHP
- ESLint config para TypeScript/React
- Commits en español
- Tests para nuevas features

---

## 📄 Licencia

Este proyecto es **privado** y propiedad de **Tecnoservicios Artavia**.

Todos los derechos reservados. No está permitido:
- ❌ Uso comercial sin autorización
- ❌ Distribución pública
- ❌ Modificación sin consentimiento

Para consultas de licenciamiento: contacto@tecnoserviciosartavia.com

---

## 👥 Créditos

**Desarrollado por:** Tecnoservicios Artavia  
**Stack:** Laravel 12 + React 18 + TypeScript + Inertia.js  
**Ubicación:** Costa Rica 🇨🇷

### Tecnologías Utilizadas

- [Laravel](https://laravel.com) - Framework PHP
- [React](https://react.dev) - Librería UI
- [Inertia.js](https://inertiajs.com) - Adaptador moderno Laravel-React
- [Tailwind CSS](https://tailwindcss.com) - Framework CSS
- [Vite](https://vitejs.dev) - Build tool
- [whatsapp-web.js](https://wwebjs.dev) - Cliente WhatsApp
- [Puppeteer](https://pptr.dev) - Headless browser

---

## 📚 Documentación Adicional

- **[PROXY_SETUP.md](PROXY_SETUP.md)** - Configuración completa de proxy inverso Apache/Nginx
- **[scripts/diagnose_proxy.php](scripts/diagnose_proxy.php)** - Script de diagnóstico automático
- **Laravel Docs:** https://laravel.com/docs
- **Inertia Docs:** https://inertiajs.com
- **React Docs:** https://react.dev

---

## 🔄 Changelog

### v1.0.0 (2025-01-15)
- ✅ Sistema completo de gestión de clientes y contratos
- ✅ Recordatorios automáticos vía WhatsApp
- ✅ Dashboard analítico
- ✅ Importación CSV/XLSX
- ✅ API REST con Sanctum
- ✅ Bot WhatsApp con TypeScript
- ✅ Soporte proxy inverso
- ✅ Scripts de diagnóstico

---

**¿Necesitas ayuda?** Ejecuta el diagnóstico automático:

```bash
php scripts/diagnose_proxy.php
```

**Desarrollado con ❤️ en Costa Rica 🇨🇷**
