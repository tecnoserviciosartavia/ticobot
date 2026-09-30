<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_chat_messages', function (Blueprint $table) {
            $table->index(['phone', 'id'], 'whatsapp_chat_messages_phone_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_chat_messages', function (Blueprint $table) {
            $table->dropIndex('whatsapp_chat_messages_phone_id_index');
        });
    }
};
