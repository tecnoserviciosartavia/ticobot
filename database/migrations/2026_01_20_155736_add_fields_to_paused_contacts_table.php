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
        Schema::table('paused_contacts', function (Blueprint $table) {
            if (!Schema::hasColumns('paused_contacts', ['client_id', 'whatsapp_number', 'reason'])) {
                $table->foreignId('client_id')->constrained()->onDelete('cascade');
                $table->string('whatsapp_number')->comment('Número de WhatsApp formateado');
                $table->text('reason')->nullable()->comment('Razón de la pausa');
                $table->unique(['client_id', 'whatsapp_number']);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('paused_contacts', function (Blueprint $table) {
            if (Schema::hasColumns('paused_contacts', ['client_id', 'whatsapp_number', 'reason'])) {
                $table->dropUnique(['client_id', 'whatsapp_number']);
                $table->dropForeignKey('paused_contacts_client_id_foreign');
                $table->dropColumn(['client_id', 'whatsapp_number', 'reason']);
            }
        });
    }
};
