<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->boolean('sinpe_email_enabled')->default(false);
            $table->string('sinpe_imap_host')->nullable();
            $table->unsignedSmallInteger('sinpe_imap_port')->default(993);
            $table->string('sinpe_imap_encryption', 10)->default('ssl');
            $table->string('sinpe_imap_folder')->default('BCR');
            $table->string('sinpe_imap_username')->nullable();
            $table->text('sinpe_imap_password')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn(['sinpe_email_enabled', 'sinpe_imap_host', 'sinpe_imap_port', 'sinpe_imap_encryption', 'sinpe_imap_folder', 'sinpe_imap_username', 'sinpe_imap_password']);
        });
    }
};
