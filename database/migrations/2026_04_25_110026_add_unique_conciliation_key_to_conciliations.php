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
        Schema::table('conciliations', function (Blueprint $table) {
            // Agregar key único para evitar duplicados entre canales: client_id_amount_currency_billing_month
            // Este no será primary key, solo un índice único para consultas
            $table->string('unique_conciliation_key')->nullable()->index()->after('payment_id');
            
            // Agregar campo para identificar el canal de origen (sinpe, manual_payment, etc)
            $table->string('channel')->nullable()->default('manual')->after('unique_conciliation_key');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('conciliations', function (Blueprint $table) {
            $table->dropIndex(['unique_conciliation_key']);
            $table->dropColumn(['unique_conciliation_key', 'channel']);
        });
    }
};
