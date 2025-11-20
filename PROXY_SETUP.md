# Configuración Proxy Inverso Apache - TicoCast.com

## Arquitectura

```
Internet → Servidor Proxy (Apache) → Servidor Backend (Apache + Laravel)
           ticocast.com                  IP: <BACKEND_IP>
           Puerto 80/443                 Puerto 80
```

---

## 1. Servidor BACKEND (este servidor - /home/fabian/ticobot)

### Configuración Apache Backend

Crea o edita el VirtualHost en `/etc/apache2/sites-available/ticobot.conf`:

```apache
<VirtualHost *:80>
    ServerAdmin admin@ticocast.com
    DocumentRoot /home/fabian/ticobot/public
    
    <Directory /home/fabian/ticobot/public>
        AllowOverride All
        Require all granted
        Options -Indexes +FollowSymLinks
        
        # Laravel rewrite rules
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteRule ^ index.php [L]
    </Directory>
    
    # Confiar en cabeceras del proxy
    SetEnvIf X-Forwarded-Proto https HTTPS=on
    SetEnvIf X-Forwarded-Proto https SERVER_PORT=443
    
    # Logs locales
    ErrorLog ${APACHE_LOG_DIR}/ticobot-error.log
    CustomLog ${APACHE_LOG_DIR}/ticobot-access.log combined
</VirtualHost>
```

### Activar sitio y módulos

```bash
# Habilitar módulos necesarios
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod setenvif

# Habilitar el sitio
sudo a2ensite ticobot.conf

# Deshabilitar sitio por defecto si existe
sudo a2dissite 000-default.conf

# Verificar configuración
sudo apache2ctl configtest

# Reiniciar Apache
sudo systemctl restart apache2
```

### Permisos de archivos

```bash
# Propietario correcto
sudo chown -R www-data:www-data /home/fabian/ticobot/storage
sudo chown -R www-data:www-data /home/fabian/ticobot/bootstrap/cache

# Permisos de escritura
sudo chmod -R ug+rwx /home/fabian/ticobot/storage
sudo chmod -R ug+rwx /home/fabian/ticobot/bootstrap/cache

# Verificar que public/ sea legible
sudo chmod -R 755 /home/fabian/ticobot/public
```

### Variables de entorno `.env`

```bash
APP_NAME="TicoBOT"
APP_ENV=production
APP_KEY=base64:... # Genera con: php artisan key:generate
APP_DEBUG=false
APP_URL=https://ticocast.com

# Resto de tu configuración...
DB_CONNECTION=sqlite
SESSION_DRIVER=database
QUEUE_CONNECTION=database
```

### Comandos Laravel post-configuración

```bash
cd /home/fabian/ticobot

# Limpiar caches
php artisan optimize:clear

# Generar caches de producción
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Verificar
php artisan about
```

---

## 2. Servidor PROXY (servidor con dominio ticocast.com)

### Configuración Apache Proxy

Crea `/etc/apache2/sites-available/ticocast.conf`:

```apache
# HTTP (redirige a HTTPS)
<VirtualHost *:80>
    ServerName ticocast.com
    ServerAlias www.ticocast.com
    
    # Redirección permanente a HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
    
    ErrorLog ${APACHE_LOG_DIR}/ticocast-redirect-error.log
    CustomLog ${APACHE_LOG_DIR}/ticocast-redirect-access.log combined
</VirtualHost>

# HTTPS (proxy inverso al backend)
<VirtualHost *:443>
    ServerName ticocast.com
    ServerAlias www.ticocast.com
    
    # SSL/TLS
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/ticocast.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/ticocast.com/privkey.pem
    # Si no tienes SSL, genera con: certbot --apache -d ticocast.com -d www.ticocast.com
    
    # Configuración de proxy
    ProxyPreserveHost On
    ProxyPass / http://<BACKEND_IP>:80/
    ProxyPassReverse / http://<BACKEND_IP>:80/
    
    # Timeout para conexiones largas (subida de archivos)
    ProxyTimeout 600
    
    # Cabeceras proxy (crítico para Laravel)
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"
    RequestHeader set X-Real-IP %{REMOTE_ADDR}s
    
    # Logs
    ErrorLog ${APACHE_LOG_DIR}/ticocast-ssl-error.log
    CustomLog ${APACHE_LOG_DIR}/ticocast-ssl-access.log combined
</VirtualHost>
```

**Reemplaza `<BACKEND_IP>` con la IP real del servidor backend.**

### Activar módulos y sitio

```bash
# Habilitar módulos de proxy
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod headers
sudo a2enmod ssl
sudo a2enmod rewrite

# Habilitar el sitio
sudo a2ensite ticocast.conf

# Verificar configuración
sudo apache2ctl configtest

# Reiniciar Apache
sudo systemctl restart apache2
```

### Obtener certificado SSL (Let's Encrypt)

```bash
# Instalar Certbot
sudo apt update
sudo apt install certbot python3-certbot-apache

# Generar certificado (interactivo)
sudo certbot --apache -d ticocast.com -d www.ticocast.com

# Renovación automática (ya configurada por defecto)
sudo certbot renew --dry-run
```

---

## 3. DNS

Apunta `ticocast.com` y `www.ticocast.com` a la **IP del servidor proxy**:

```
Tipo    Nombre              Valor
A       ticocast.com        <IP_SERVIDOR_PROXY>
A       www                 <IP_SERVIDOR_PROXY>
```

Verifica propagación:

```bash
dig +short ticocast.com
dig +short www.ticocast.com
```

---

## 4. Diagnóstico y Testing

### Desde el servidor backend

```bash
# Ejecutar script de diagnóstico
php /home/fabian/ticobot/scripts/diagnose_proxy.php

# Verificar que Apache escucha en puerto 80
sudo ss -tlnp | grep :80

# Ver últimos logs de error
tail -f /var/log/apache2/ticobot-error.log
```

### Desde el servidor proxy

```bash
# Probar backend directo (sin SSL)
curl -I http://<BACKEND_IP>/

# Ver cabeceras enviadas al backend
curl -v http://<BACKEND_IP>/ 2>&1 | grep '>'

# Ver logs de proxy
tail -f /var/log/apache2/ticocast-ssl-error.log
```

### Desde cualquier lugar (Internet)

```bash
# Verificar código de respuesta
curl -I https://ticocast.com/

# Ver cabeceras completas
curl -v https://ticocast.com/ 2>&1 | less

# Probar endpoint de salud de Laravel
curl https://ticocast.com/up

# Ver diagnóstico via web (opcional, si lo expones)
curl https://ticocast.com/scripts/diagnose_proxy.php
```

---

## 5. Resolución de Problemas

### Página en blanco

1. **Verificar logs:**
   ```bash
   # Backend
   tail -n 100 /home/fabian/ticobot/storage/logs/laravel.log
   tail -n 50 /var/log/apache2/ticobot-error.log
   
   # Proxy
   tail -n 50 /var/log/apache2/ticocast-ssl-error.log
   ```

2. **Activar debug temporal** (`.env` en backend):
   ```
   APP_DEBUG=true
   ```
   Luego: `php artisan config:clear`

3. **Verificar permisos:**
   ```bash
   ls -la /home/fabian/ticobot/storage
   ls -la /home/fabian/ticobot/bootstrap/cache
   ```

4. **Probar backend directo:**
   ```bash
   curl http://<BACKEND_IP>/ | head -n 50
   ```
   Debe devolver HTML con `<!DOCTYPE html>`.

### ERR_SSL_PROTOCOL_ERROR

- Verifica certificado SSL en servidor proxy:
  ```bash
  sudo certbot certificates
  ```
- Comprueba que el puerto 443 esté abierto en firewall.

### 502 Bad Gateway

- Backend Apache no responde:
  ```bash
  sudo systemctl status apache2
  ```
- Firewall bloqueando conexión proxy → backend:
  ```bash
  # En servidor backend
  sudo ufw allow from <IP_PROXY> to any port 80
  ```

### Assets (CSS/JS) no cargan

1. Verificar que `.env` tenga:
   ```
   APP_URL=https://ticocast.com
   ```

2. Limpiar y regenerar:
   ```bash
   php artisan optimize:clear
   npm run build  # Si modificaste frontend
   ```

3. Verificar manifest:
   ```bash
   ls -lh /home/fabian/ticobot/public/build/manifest.json
   ```

### Redireccionamiento infinito

- Verificar `TrustProxies` esté configurado (ya hecho).
- Asegurar que proxy envíe `X-Forwarded-Proto: https`.
- Revisar si hay middleware personalizado forzando esquema.

---

## 6. Monitoreo

### Healthcheck automático

Laravel ya expone `/up` (configurado en `bootstrap/app.php`):

```bash
# Debe devolver 200 OK
curl -I https://ticocast.com/up
```

Puedes agregar a crontab en servidor proxy:

```cron
*/5 * * * * curl -f https://ticocast.com/up > /dev/null 2>&1 || echo "TicoCast DOWN" | mail -s "Alert" admin@ticocast.com
```

### Logs de acceso

```bash
# Ver IPs de visitantes (backend ve IP del proxy)
tail /var/log/apache2/ticobot-access.log

# Ver IPs reales (proxy ve IPs públicas)
tail /var/log/apache2/ticocast-ssl-access.log
```

---

## 7. Seguridad Adicional

### Firewall en backend

Solo aceptar tráfico del proxy:

```bash
# UFW example
sudo ufw default deny incoming
sudo ufw allow from <IP_PROXY> to any port 80
sudo ufw allow 22  # SSH
sudo ufw enable
```

### Rate limiting en proxy

Agregar al VirtualHost del proxy:

```apache
<VirtualHost *:443>
    # ... config existente ...
    
    # Limitar peticiones (requiere mod_evasive)
    <IfModule mod_evasive20.c>
        DOSHashTableSize 3097
        DOSPageCount 5
        DOSSiteCount 50
        DOSPageInterval 1
        DOSSiteInterval 1
        DOSBlockingPeriod 10
    </IfModule>
</VirtualHost>
```

---

## Resumen de Pasos Críticos

1. ✅ **Backend:** Apache sirviendo `public/`, módulos `rewrite` y `headers` activos
2. ✅ **Laravel:** `TrustProxies` configurado, `.env` con `APP_URL` correcto
3. ✅ **Proxy:** Apache con `ProxyPass`, cabeceras `X-Forwarded-*` enviadas
4. ✅ **DNS:** Dominio apuntando a IP del proxy
5. ✅ **SSL:** Certificado válido en servidor proxy
6. ✅ **Permisos:** `storage/` y `bootstrap/cache/` escribibles por `www-data`
7. ✅ **Assets:** `npm run build` ejecutado, `manifest.json` presente

---

**¿Necesitas ayuda con algún paso específico?** Ejecuta el diagnóstico:

```bash
php /home/fabian/ticobot/scripts/diagnose_proxy.php
```
