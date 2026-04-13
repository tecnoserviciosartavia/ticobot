<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contract_service', function (Blueprint $table) {
            if (! Schema::hasColumn('contract_service', 'pin_override')) {
                $table->string('pin_override', 32)->nullable()->after('quantity');
            }
        });
    }

    public function down(): void
    {
        Schema::table('contract_service', function (Blueprint $table) {
            if (Schema::hasColumn('contract_service', 'pin_override')) {
                $table->dropColumn('pin_override');
            }
        });
    }
};