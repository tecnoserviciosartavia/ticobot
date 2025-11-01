# 🤖 Ticobot - Sistema de Recordatorios WhatsApp<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>



Sistema automatizado de recordatorios de pagos vía WhatsApp para gestión de clientes, contratos y cobros.<p align="center">

<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>

## 📋 Características<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>

<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>

- ✅ **Gestión de Clientes y Contratos**: CRUD completo con React/Inertia<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>

- ✅ **Recordatorios Automáticos**: Sistema de recordatorios programables</p>

- ✅ **Integración WhatsApp**: Bot automatizado con whatsapp-web.js

- ✅ **Gestión de Pagos**: Control de pagos, recibos y conciliaciones## About Laravel

- ✅ **Interfaz Moderna**: UI con React, TypeScript y Tailwind CSS

- ✅ **Sistema de Colas**: Procesamiento asíncrono con Laravel QueueLaravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- ✅ **API REST**: Endpoints completos con Laravel Sanctum

- [Simple, fast routing engine](https://laravel.com/docs/routing).

## 🛠️ Stack Tecnológico- [Powerful dependency injection container](https://laravel.com/docs/container).

- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.

### Backend- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).

- **Laravel 12** - Framework PHP- Database agnostic [schema migrations](https://laravel.com/docs/migrations).

- **MySQL** - Base de datos- [Robust background job processing](https://laravel.com/docs/queues).

- **Redis** - Cache y colas (opcional)- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

- **Laravel Sanctum** - Autenticación API

Laravel is accessible, powerful, and provides tools required for large, robust applications.

### Frontend

- **React 18** - UI Library## Learning Laravel

- **TypeScript** - Tipado estático

- **Inertia.js** - Stack moderno sin APILaravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework. You can also check out [Laravel Learn](https://laravel.com/learn), where you will be guided through building a modern Laravel application.

- **Tailwind CSS** - Estilos utility-first

- **Vite** - Build toolIf you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.



### Bot WhatsApp## Laravel Sponsors

- **Node.js** - Runtime

- **TypeScript** - LenguajeWe would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

- **whatsapp-web.js** - Cliente WhatsApp

- **Puppeteer** - Headless browser### Premium Partners



## 📦 Requisitos- **[Vehikl](https://vehikl.com)**

- **[Tighten Co.](https://tighten.co)**

- PHP >= 8.2- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**

- Node.js >= 18.x- **[64 Robots](https://64robots.com)**

- Composer >= 2.x- **[Curotec](https://www.curotec.com/services/technologies/laravel)**

- MySQL >= 8.0- **[DevSquad](https://devsquad.com/hire-laravel-developers)**

- Apache/Nginx con mod_rewrite- **[Redberry](https://redberry.international/laravel-development)**

- **[Active Logic](https://activelogic.com)**

## 🚀 Instalación

## Contributing

### 1. Clonar el repositorio

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

```bash

git clone git@github.com:tecnoserviciosartavia/ticobot.git## Code of Conduct

cd ticobot

```In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).



### 2. Configurar el Backend (Laravel)## Security Vulnerabilities



```bashIf you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

# Instalar dependencias de PHP

composer install## License



# Copiar archivo de configuraciónThe Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).

cp .env.example .env

# Generar clave de aplicación
php artisan key:generate

# Configurar base de datos en .env
# DB_CONNECTION=mysql
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_DATABASE=ticobot
# DB_USERNAME=tu_usuario
# DB_PASSWORD=tu_contraseña

# Ejecutar migraciones
php artisan migrate

# Crear usuario inicial
php artisan tinker
# >>> User::factory()->create(['email' => 'admin@ticobot.com']);

# Instalar dependencias de Node.js
npm install

# Compilar assets
npm run build
```

### 3. Configurar el Bot de WhatsApp

```bash
cd bot

# Instalar dependencias
npm install

# Copiar configuración
cp .env.example .env

# Editar bot/.env con la URL de tu API
# BOT_API_BASE_URL=http://tu-servidor/api
# BOT_API_TOKEN=tu_token_api

# Generar token de API desde el backend
cd ..
php artisan tinker
# >>> User::first()->createToken('bot-token')->plainTextToken;
# Copiar el token generado a bot/.env
```

## 🎯 Uso

### Modo Desarrollo

#### Opción 1: Servidor integrado (Recomendado)
```bash
# Inicia servidor, queue, logs y vite simultáneamente
composer dev
```

#### Opción 2: Comandos individuales
```bash
# Terminal 1 - Servidor Laravel
php artisan serve

# Terminal 2 - Queue Worker
php artisan queue:listen

# Terminal 3 - Frontend (Vite)
npm run dev

# Terminal 4 - Bot WhatsApp
cd bot && npm run dev
```

### Modo Producción

#### Servidor Web (Apache/Nginx)

1. **Configurar permisos**:
```bash
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache
```

2. **Optimizar Laravel**:
```bash
php artisan config:cache
php artisan route:cache
php artisan view:cache
npm run build
```

3. **Configurar servidor web** (ver configuración de Apache/Nginx abajo)

4. **Iniciar Bot WhatsApp**:
```bash
cd bot
npm run build
pm2 start dist/index.js --name ticobot-bot
# o con screen/tmux
screen -S ticobot-bot
node dist/index.js
```

5. **Queue Worker** (en producción):
```bash
php artisan queue:work --daemon --tries=3
# o con supervisor
```

## 📱 Vinculación de WhatsApp

1. Accede a `/profile` en tu navegador
2. El bot generará automáticamente un código QR
3. Escanea el QR con WhatsApp > Menú > Dispositivos vinculados
4. El estado cambiará a "Sincronizado" automáticamente

## 🗄️ Comandos de Base de Datos

### Comandos estándar de Laravel

```bash
# Limpiar completamente y volver a crear
php artisan db:fresh

# Limpiar y migrar con datos de prueba
php artisan db:fresh --seed

# Solo ejecutar migraciones pendientes
php artisan migrate

# Revertir última migración
php artisan migrate:rollback

# Revertir todas las migraciones
php artisan migrate:reset
```

### Comandos personalizados de limpieza

```bash
# Limpiar solo recordatorios enviados (más de 30 días)
php artisan db:clean:reminders

# Limpiar mensajes de recordatorios antiguos
php artisan db:clean:messages

# Limpiar pagos sin confirmar (más de 60 días)
php artisan db:clean:payments

# Limpiar recibos de pagos huérfanos
php artisan db:clean:receipts

# Limpiar todo excepto usuarios y clientes activos
php artisan db:clean:all --keep-users --keep-clients

# Limpiar cache de WhatsApp
php artisan cache:forget whatsapp:*
```

## 📊 Estructura del Proyecto

```
ticobot/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Api/          # Controladores API
│   │   │   └── Web/          # Controladores Web
│   ├── Models/               # Modelos Eloquent
│   └── Support/              # Clases de soporte
├── bot/
│   ├── src/
│   │   ├── api-client.ts     # Cliente API Laravel
│   │   ├── whatsapp-client.ts # Cliente WhatsApp
│   │   ├── reminder-processor.ts # Procesador de recordatorios
│   │   └── index.ts          # Punto de entrada
│   └── package.json
├── database/
│   ├── migrations/           # Migraciones de BD
│   ├── factories/            # Factories para testing
│   └── seeders/              # Seeders de datos
├── resources/
│   ├── js/
│   │   ├── Components/       # Componentes React
│   │   ├── Layouts/          # Layouts
│   │   └── Pages/            # Páginas Inertia
│   └── views/
├── routes/
│   ├── web.php               # Rutas web
│   └── api.php               # Rutas API
└── public/                   # Archivos públicos
```

## ⚙️ Configuración de Servidor

### Apache (.htaccess ya incluido)

Archivo de configuración sugerido en `/etc/apache2/sites-available/ticobot.conf`:

```apache
<VirtualHost *:80>
    ServerName ticobot.tudominio.com
    DocumentRoot /ruta/a/ticobot/public

    <Directory /ruta/a/ticobot/public>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/ticobot-error.log
    CustomLog ${APACHE_LOG_DIR}/ticobot-access.log combined
</VirtualHost>
```

Habilitar sitio:
```bash
sudo a2ensite ticobot.conf
sudo systemctl reload apache2
```

### Nginx

Archivo de configuración en `/etc/nginx/sites-available/ticobot`:

```nginx
server {
    listen 80;
    server_name ticobot.tudominio.com;
    root /ruta/a/ticobot/public;

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

Habilitar sitio:
```bash
sudo ln -s /etc/nginx/sites-available/ticobot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🔐 Seguridad

- Cambiar `APP_KEY` en producción
- Configurar `APP_ENV=production`
- Configurar `APP_DEBUG=false`
- Usar HTTPS en producción
- Rotar tokens de API regularmente
- Configurar CORS correctamente
- Mantener dependencias actualizadas

## 🧪 Testing

```bash
# Ejecutar todos los tests
php artisan test

# Tests con coverage
php artisan test --coverage

# Tests específicos
php artisan test --filter=ClientTest
```

## 📝 Variables de Entorno Importantes

### Laravel (.env)
```env
APP_NAME=Ticobot
APP_ENV=production
APP_DEBUG=false
APP_URL=https://ticobot.tudominio.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=ticobot
DB_USERNAME=usuario
DB_PASSWORD=contraseña

QUEUE_CONNECTION=database
CACHE_STORE=file
```

### Bot (bot/.env)
```env
BOT_API_BASE_URL=https://ticobot.tudominio.com/api
BOT_API_TOKEN=tu_token_sanctum
BOT_POLL_INTERVAL_MS=30000
BOT_LOOK_AHEAD_MINUTES=30
BOT_DEFAULT_COUNTRY_CODE=506
```

## 🐛 Troubleshooting

### Bot no genera QR
```bash
# Verificar permisos
cd bot
chmod -R 755 storage

# Limpiar sesión de WhatsApp
rm -rf bot/.wwebjs_cache bot/storage

# Reiniciar bot
npm run dev
```

### Error de permisos Laravel
```bash
sudo chown -R $USER:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache
```

### Assets no se cargan
```bash
npm run build
php artisan view:clear
php artisan config:clear
```

## 📞 Soporte

Para reportar bugs o solicitar features, crear un issue en GitHub.

## 📄 Licencia

Este proyecto es privado y propiedad de Tecnoservicios Artavia.

---

**Desarrollado con ❤️ en Costa Rica 🇨🇷**
