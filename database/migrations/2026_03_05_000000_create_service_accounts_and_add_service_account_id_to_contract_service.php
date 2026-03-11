<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_accounts', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('service_id');
            $table->string('name')->nullable();
            $table->string('identifier')->nullable(); // e.g. email or account id
            $table->json('metadata')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->foreign('service_id')->references('id')->on('services')->onDelete('cascade');
        });

        Schema::table('contract_service', function (Blueprint $table) {
            if (!Schema::hasColumn('contract_service', 'service_account_id')) {
                $table->unsignedBigInteger('service_account_id')->nullable()->after('service_id');
                $table->foreign('service_account_id')->references('id')->on('service_accounts')->onDelete('set null');
            }
        });
    }

    public function down(): void
    {
        Schema::table('contract_service', function (Blueprint $table) {
            if (Schema::hasColumn('contract_service', 'service_account_id')) {
                $table->dropForeign(['service_account_id']);
                $table->dropColumn('service_account_id');
            }
        });

        Schema::dropIfExists('service_accounts');
    }
};
