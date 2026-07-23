<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Política de Privacidad | {{ config('app.name', 'TicoBot') }}</title>
    <style>
        :root { color-scheme: light; }
        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: linear-gradient(180deg, #f7f8fc 0%, #eef3ff 100%);
            color: #1f2937;
            line-height: 1.6;
        }
        .wrap {
            max-width: 920px;
            margin: 0 auto;
            padding: 48px 20px 64px;
        }
        .card {
            background: rgba(255, 255, 255, 0.96);
            border: 1px solid rgba(148, 163, 184, 0.28);
            border-radius: 20px;
            box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
            padding: 32px;
        }
        h1 { margin: 0 0 8px; font-size: 2rem; }
        h2 { margin-top: 30px; margin-bottom: 8px; font-size: 1.1rem; }
        p { margin: 0 0 12px; }
        ul { margin: 0 0 12px 22px; }
        .meta {
            color: #64748b;
            font-size: 0.95rem;
            margin-bottom: 24px;
        }
        .tag {
            display: inline-block;
            padding: 6px 10px;
            border-radius: 999px;
            background: #e2e8f0;
            color: #0f172a;
            font-size: 0.85rem;
            margin-bottom: 18px;
        }
        a { color: #0f62fe; }
        .footer {
            margin-top: 32px;
            padding-top: 18px;
            border-top: 1px solid #e5e7eb;
            color: #475569;
            font-size: 0.95rem;
        }
    </style>
</head>
<body>
    <main class="wrap">
        <section class="card">
            <div class="tag">Política de Privacidad</div>
            <h1>Política de Privacidad</h1>
            <div class="meta">Última actualización: {{ now()->format('d/m/Y') }}</div>

            <p>{{ config('app.name', 'TicoBot') }} usa información de clientes y contactos para gestionar comunicación, cobros, recordatorios y soporte a través de WhatsApp y otros canales del sistema.</p>

            <h2>Información que podemos recopilar</h2>
            <ul>
                <li>Nombre, número telefónico y datos de contacto.</li>
                <li>Mensajes enviados al bot o al equipo de atención.</li>
                <li>Datos de contratos, pagos, recordatorios y conciliaciones.</li>
                <li>Archivos compartidos, como comprobantes o PDFs asociados a pagos.</li>
                <li>Datos técnicos mínimos de uso, como registros de eventos y auditoría.</li>
            </ul>

            <h2>Cómo usamos la información</h2>
            <ul>
                <li>Enviar recordatorios y notificaciones sobre pagos y servicios.</li>
                <li>Responder consultas y dar seguimiento a solicitudes.</li>
                <li>Conciliar pagos y mantener historial operativo.</li>
                <li>Administrar servicios contratados y accesos asociados.</li>
            </ul>

            <h2>Compartición de datos</h2>
            <p>No vendemos tus datos. Solo compartimos información con proveedores tecnológicos necesarios para operar el servicio, por ejemplo, servicios de mensajería, almacenamiento o infraestructura.</p>

            <h2>Conservación</h2>
            <p>Los datos se conservan mientras sean necesarios para la operación del servicio, cumplimiento contractual, soporte o requisitos legales/contables.</p>

            <h2>Seguridad</h2>
            <p>Aplicamos medidas razonables para proteger la información. Ningún sistema es 100% seguro, pero trabajamos para reducir riesgos y controlar accesos.</p>

            <h2>Contacto</h2>
            <p>Si tienes preguntas sobre privacidad, puedes escribir a <a href="mailto:{{ config('mail.from.address', 'admin@ticotiempos.com') }}">{{ config('mail.from.address', 'admin@ticotiempos.com') }}</a>.</p>

            <div class="footer">
                Esta página existe para cumplir con los requisitos de Meta y para informar el uso del sistema.
            </div>
        </section>
    </main>
</body>
</html>
