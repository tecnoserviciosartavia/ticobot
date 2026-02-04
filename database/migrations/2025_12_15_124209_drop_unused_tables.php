<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::dropIfExists('bot_responses');
        Schema::dropIfExists('reminder_templates');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No se restauran las tablas porque no se usaban
    }
};
