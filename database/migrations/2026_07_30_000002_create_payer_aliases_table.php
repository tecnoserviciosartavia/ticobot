<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payer_aliases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->string('origin_name');
            $table->string('normalized_name')->index();
            $table->string('origin_phone', 32)->nullable()->index();
            $table->decimal('last_amount', 12, 2)->nullable();
            $table->unsignedInteger('match_count')->default(1);
            $table->timestamp('last_seen_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['company_id', 'client_id', 'normalized_name'], 'payer_alias_company_client_name_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payer_aliases');
    }
};
