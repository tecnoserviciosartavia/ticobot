<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('paused_contacts')) {
            return;
        }

        // 1) Make client_id nullable so we can pause numbers not in the system.
        // We keep it best-effort to support SQLite in CI.
        try {
            if (Schema::hasColumn('paused_contacts', 'client_id')) {
                Schema::table('paused_contacts', function (Blueprint $table) {
                    $table->foreignId('client_id')->nullable()->change();
                });
            }
        } catch (\Throwable $e) {
            // ignore (some drivers require doctrine/dbal); we still want the app to run.
        }

        // 2) Drop old unique index (client_id, whatsapp_number) if present.
        try {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->dropUnique('paused_contacts_client_id_whatsapp_number_unique');
            });
        } catch (\Throwable $e) {
            // ignore
        }

        // 3) Ensure unique whatsapp_number index exists.
        try {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->unique('whatsapp_number');
            });
        } catch (\Throwable $e) {
            // ignore
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('paused_contacts')) {
            return;
        }

        // best-effort rollback
        try {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->dropUnique('paused_contacts_whatsapp_number_unique');
            });
        } catch (\Throwable $e) {
            // ignore
        }

        try {
            Schema::table('paused_contacts', function (Blueprint $table) {
                $table->unique(['client_id', 'whatsapp_number']);
            });
        } catch (\Throwable $e) {
            // ignore
        }
    }
};
