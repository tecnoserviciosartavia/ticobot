<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sinpe_email_transactions', function (Blueprint $table) {
            $table->foreignId('company_id')->nullable()->after('id')->constrained('companies')->nullOnDelete();
            $table->index(['company_id', 'status']);
        });

        DB::table('sinpe_email_transactions')->whereNotNull('matched_client_id')->update([
            'company_id' => DB::raw('(select company_id from clients where clients.id = sinpe_email_transactions.matched_client_id)'),
        ]);
    }

    public function down(): void
    {
        Schema::table('sinpe_email_transactions', function (Blueprint $table) {
            $table->dropIndex(['company_id', 'status']);
            $table->dropConstrainedForeignId('company_id');
        });
    }
};
