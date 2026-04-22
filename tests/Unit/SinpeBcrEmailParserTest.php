<?php

namespace Tests\Unit;

use App\Services\SinpeBcrEmailParser;
use Tests\TestCase;

class SinpeBcrEmailParserTest extends TestCase
{
    public function test_it_parses_bcr_sinpe_mobile_email_body(): void
    {
        config()->set('app.timezone', 'America/Costa_Rica');

        $body = <<<TXT
Transacción SINPE MÓVIL

Estimado (a): ARTAVIA SERRANO FABIAN ALBERTO

Le informamos que se le ha acreditado en su cuenta BCR la siguiente transacción SINPE Móvil:

Número de referencia: 2026042281383010085149940

Teléfono origen: 87509190

Nombre cliente origen: ZELEDON MENDEZ LUIS

Entidad origen: CoopeAlianza

Monto: 2,000.00

Motivo: TDMAX UN DISPOSITIVO

Esta transacción fue realizada el 22/04/2026 a las 11:00 AM
TXT;

        $parser = new SinpeBcrEmailParser();
        $parsed = $parser->parse($body);

        $this->assertNotNull($parsed);
        $this->assertSame('2026042281383010085149940', $parsed['reference']);
        $this->assertSame('87509190', $parsed['origin_phone']);
        $this->assertSame('ZELEDON MENDEZ LUIS', $parsed['origin_name']);
        $this->assertSame('TDMAX UN DISPOSITIVO', $parsed['motive']);
        $this->assertSame(2000.00, $parsed['amount']);
        $this->assertSame('2026-04-22 11:00:00', $parsed['performed_at']);
    }
}
