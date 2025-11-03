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
        if (Schema::hasColumn('clients', 'legal_id')) {
            Schema::table('clients', function (Blueprint $table) {
                // Dropping the column will also drop any associated indexes
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
