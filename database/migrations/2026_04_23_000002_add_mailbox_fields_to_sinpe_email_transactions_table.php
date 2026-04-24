<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sinpe_email_transactions', function (Blueprint $table) {
            $table->string('mail_subject')->nullable()->after('message_uid');
            $table->boolean('is_read')->default(false)->after('mail_subject');
        });
    }

    public function down(): void
    {
        Schema::table('sinpe_email_transactions', function (Blueprint $table) {
            $table->dropColumn(['mail_subject', 'is_read']);
        });
    }
};