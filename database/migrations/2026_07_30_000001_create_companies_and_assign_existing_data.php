<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('reminder_template')->nullable();
            $table->string('payment_contact')->nullable();
            $table->text('bank_accounts')->nullable();
            $table->string('beneficiary_name')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        $now = now();
        $ticocastId = DB::table('companies')->insertGetId([
            'name' => 'TicoCast', 'slug' => 'ticocast',
            'reminder_template' => DB::table('app_settings')->where('key', 'reminder_template')->value('value'),
            'payment_contact' => DB::table('app_settings')->where('key', 'payment_contact')->value('value'),
            'bank_accounts' => DB::table('app_settings')->where('key', 'bank_accounts')->value('value'),
            'beneficiary_name' => DB::table('app_settings')->where('key', 'beneficiary_name')->value('value'),
            'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('companies')->insert(['name' => 'TicoFac', 'slug' => 'ticofac', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
        Schema::table('clients', fn (Blueprint $table) => $table->foreignId('company_id')->nullable()->after('id')->constrained()->restrictOnDelete());
        Schema::table('services', fn (Blueprint $table) => $table->foreignId('company_id')->nullable()->after('id')->constrained()->restrictOnDelete());
        DB::table('clients')->whereNull('company_id')->update(['company_id' => $ticocastId]);
        DB::table('services')->whereNull('company_id')->update(['company_id' => $ticocastId]);
        DB::table('app_settings')->updateOrInsert(['key' => 'multi_company_enabled'], ['value' => '1', 'description' => 'Activa múltiples empresas', 'updated_at' => $now, 'created_at' => $now]);
    }

    public function down(): void
    {
        Schema::table('services', fn (Blueprint $table) => $table->dropConstrainedForeignId('company_id'));
        Schema::table('clients', fn (Blueprint $table) => $table->dropConstrainedForeignId('company_id'));
        Schema::dropIfExists('companies');
        DB::table('app_settings')->where('key', 'multi_company_enabled')->delete();
    }
};
