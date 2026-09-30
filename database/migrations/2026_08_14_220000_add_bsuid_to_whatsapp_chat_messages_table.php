<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_chat_messages', function (Blueprint $table): void {
            // Conserva el número como clave para los chats actuales y permite la
            // clave sintética `bsuid:<id>` cuando Meta no entregue un teléfono.
            $table->string('phone', 191)->change();
            $table->string('identity_type', 20)->default('phone')->after('phone');
            $table->string('whatsapp_user_id', 191)->nullable()->after('identity_type');
            $table->index('whatsapp_user_id', 'whatsapp_chat_messages_user_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_chat_messages', function (Blueprint $table): void {
            $table->dropIndex('whatsapp_chat_messages_user_id_index');
            $table->dropColumn(['identity_type', 'whatsapp_user_id']);
            $table->string('phone', 20)->change();
        });
    }
};
