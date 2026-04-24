<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_expected_payment_push_notifications', function (Blueprint $table) {
            $table->id();
            $table->date('summary_date');
            $table->string('token', 512);
            $table->timestamp('sent_at');
            $table->timestamps();

            $table->unique(['summary_date', 'token'], 'daily_expected_payment_push_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_expected_payment_push_notifications');
    }
};
