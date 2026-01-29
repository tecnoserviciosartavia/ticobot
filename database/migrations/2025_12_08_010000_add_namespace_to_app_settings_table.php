
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
	public function up(): void
	{
		if (Schema::hasTable('app_settings') && ! Schema::hasColumn('app_settings', 'namespace')) {
			Schema::table('app_settings', function (Blueprint $table) {
				// Namespace para agrupar settings (ej: 'whatsapp', 'bot', etc.)
				$table->string('namespace')->nullable()->after('key');
			});
		}
	}

	public function down(): void
	{
		if (Schema::hasTable('app_settings') && Schema::hasColumn('app_settings', 'namespace')) {
			Schema::table('app_settings', function (Blueprint $table) {
				$table->dropColumn('namespace');
			});
		}
	}
};

