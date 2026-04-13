<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_payment_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
            $table->date('due_date');
            $table->string('phone', 32);
            $table->timestamp('sent_at');
            $table->timestamps();

            $table->unique(['service_id', 'due_date', 'phone'], 'service_payment_notifications_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_payment_notifications');
    }
};
