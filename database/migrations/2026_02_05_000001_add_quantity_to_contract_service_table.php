<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contract_service', function (Blueprint $table) {
            if (! Schema::hasColumn('contract_service', 'quantity')) {
                $table->unsignedInteger('quantity')->default(1)->after('service_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('contract_service', function (Blueprint $table) {
            if (Schema::hasColumn('contract_service', 'quantity')) {
                $table->dropColumn('quantity');
            }
        });
    }
};
