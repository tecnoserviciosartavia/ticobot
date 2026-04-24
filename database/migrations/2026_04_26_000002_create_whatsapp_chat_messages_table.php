<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_chat_messages', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 20)->index();
            $table->string('direction')->default('inbound'); // inbound | outbound
            $table->text('body')->nullable();
            $table->string('status', 20)->default('received'); // received | queued | sent | failed
            $table->string('whatsapp_message_id')->nullable();
            $table->foreignId('sent_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('metadata')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->index(['phone', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_chat_messages');
    }
};
