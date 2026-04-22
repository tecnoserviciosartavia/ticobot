<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sinpe_email_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->string('origin_phone', 32)->nullable();
            $table->string('origin_name')->nullable();
            $table->string('motive')->nullable();
            $table->decimal('amount', 12, 2)->default(0);
            $table->dateTime('performed_at')->nullable();
            $table->string('message_uid')->nullable();
            $table->string('status', 50)->default('skipped');
            $table->foreignId('matched_client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->foreignId('matched_contract_id')->nullable()->constrained('contracts')->nullOnDelete();
            $table->foreignId('payment_id')->nullable()->constrained('payments')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->text('raw_excerpt')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sinpe_email_transactions');
    }
};
