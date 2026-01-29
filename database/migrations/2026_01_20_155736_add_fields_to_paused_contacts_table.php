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
        if (!Schema::hasTable('paused_contacts')) {
            return;
        }

        // Add missing columns one by one (SQLite + Doctrine schema introspection can be finicky)
        if (!Schema::hasColumn('paused_contacts', 'client_id')) {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->foreignId('client_id')->constrained()->onDelete('cascade')->after('id');
            });
        }

        if (!Schema::hasColumn('paused_contacts', 'whatsapp_number')) {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->string('whatsapp_number')->comment('Número de WhatsApp formateado')->after('client_id');
            });
        }

        if (!Schema::hasColumn('paused_contacts', 'reason')) {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->text('reason')->nullable()->comment('Razón de la pausa')->after('whatsapp_number');
            });
        }

        // Ensure unique index exists (ignore if it's already there)
        try {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->unique(['client_id', 'whatsapp_number']);
            });
        } catch (\Throwable $e) {
            // ignore
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('paused_contacts')) {
            return;
        }

        // drop unique index if it exists
        try {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->dropUnique('paused_contacts_client_id_whatsapp_number_unique');
            });
        } catch (\Throwable $e) {
            // ignore
        }

        // drop FK + columns (best-effort)
        try {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->dropForeign(['client_id']);
            });
        } catch (\Throwable $e) {
            // ignore
        }

        $dropCols = [];
        foreach (['client_id', 'whatsapp_number', 'reason'] as $col) {
            if (Schema::hasColumn('paused_contacts', $col)) {
                $dropCols[] = $col;
            }
        }
        if (!empty($dropCols)) {
            Schema::table('paused_contacts', function (Blueprint $table) use ($dropCols) {
                $table->dropColumn($dropCols);
            });
        }
    }
};
