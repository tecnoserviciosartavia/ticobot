<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasColumn('clients', 'legal_id')) {
            // SQLite puede dejar índices huérfanos o lanzar error al hacer DROP COLUMN.
            // Hacemos el drop idempotente y tolerante.

            // 1) Intentar eliminar el índice unique si existe (nombre esperado por Laravel).
            try {
                Schema::table('clients', function (Blueprint $table) {
                    $table->dropUnique('clients_legal_id_unique');
                });
            } catch (\Throwable $e) {
                // ignorar (no existe / motor no lo requiere)
            }

            // 2) Intentar eliminar el índice directamente en SQLite si aún existe.
            try {
                if (DB::getDriverName() === 'sqlite') {
                    DB::statement('DROP INDEX IF EXISTS clients_legal_id_unique');
                }
            } catch (\Throwable $e) {
                // ignorar
            }

            // 3) Finalmente eliminar la columna.
            Schema::table('clients', function (Blueprint $table) {
                $table->dropColumn('legal_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasColumn('clients', 'legal_id')) {
            Schema::table('clients', function (Blueprint $table) {
                $table->string('legal_id')->nullable()->unique();
            });
        }
    }
};
