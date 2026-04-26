<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // No necesitamos remover el unique constraint en payment_id
        // Cada pago seguirá teniendo una sola conciliación
        // El unique_conciliation_key es para evitar duplicados entre canales (indexado, no unique)
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op
    }
};
