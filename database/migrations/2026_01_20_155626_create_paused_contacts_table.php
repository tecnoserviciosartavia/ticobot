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
        // Make migration idempotent: only create table if it does not already exist
        if (!Schema::hasTable('paused_contacts')) {
            Schema::create('paused_contacts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('client_id')->constrained()->onDelete('cascade');
                $table->string('whatsapp_number')->comment('Número de WhatsApp formateado');
                $table->text('reason')->nullable()->comment('Razón de la pausa');
                $table->timestamps();
                $table->unique(['client_id', 'whatsapp_number']);
            });
        } else {
            // If the table already exists, ensure the expected index exists.
            // This avoids errors when the migration runs against an environment
            // where the table was created manually or by a previous migration.
            if (!Schema::hasColumn('paused_contacts', 'whatsapp_number')) {
                Schema::table('paused_contacts', function (Blueprint $table) {
                    $table->string('whatsapp_number')->comment('Número de WhatsApp formateado')->after('client_id');
                });
            }
            // ensure unique index exists — attempt to create and ignore errors if already present
            try {
                Schema::table('paused_contacts', function (Blueprint $table) {
                    $table->unique(['client_id', 'whatsapp_number']);
                });
            } catch (\Throwable $e) {
                // ignore: index may already exist or DB driver may not allow this operation
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('paused_contacts');
    }
};
