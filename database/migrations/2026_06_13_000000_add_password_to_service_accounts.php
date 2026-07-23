<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('service_accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('service_accounts', 'password')) {
                $table->string('password')->nullable()->after('identifier');
            }
        });
    }

    public function down(): void
    {
        Schema::table('service_accounts', function (Blueprint $table) {
            if (Schema::hasColumn('service_accounts', 'password')) {
                $table->dropColumn('password');
            }
        });
    }
};
