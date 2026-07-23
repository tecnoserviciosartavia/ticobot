<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Eliminación de Datos | {{ config('app.name', 'TicoBot') }}</title>
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
            background: #dbeafe;
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
            <div class="tag">Eliminación de Datos</div>
            <h1>Solicitud de eliminación de datos</h1>
            <div class="meta">Última actualización: {{ now()->format('d/m/Y') }}</div>

            <p>Si deseas que eliminemos tus datos personales de nuestros sistemas, puedes solicitarlo por este medio.</p>

            <h2>Qué puedes solicitar</h2>
            <ul>
                <li>Eliminación de tu número telefónico de contacto.</li>
                <li>Eliminación de tu información de conversación y seguimiento, cuando aplique.</li>
                <li>Revisión de datos conservados por motivos operativos o legales.</li>
            </ul>

            <h2>Cómo pedirlo</h2>
            <p>Envía un correo a <a href="mailto:{{ config('mail.from.address', 'admin@ticotiempos.com') }}">{{ config('mail.from.address', 'admin@ticotiempos.com') }}</a> indicando tu nombre y el número telefónico asociado a la cuenta.</p>
            <p>También puedes responder por WhatsApp solicitando la eliminación de datos y nuestro equipo te guiará con la verificación necesaria.</p>

            <h2>Importante</h2>
            <ul>
                <li>Algunos datos pueden conservarse por obligaciones legales, contables o de seguridad.</li>
                <li>Si tu cuenta forma parte de contratos activos, puede ser necesario conservar parte del historial para cerrar obligaciones pendientes.</li>
            </ul>

            <div class="footer">
                Esta página existe para cumplir con los requisitos de Meta y para atender solicitudes de privacidad.
            </div>
        </section>
    </main>
</body>
</html>
