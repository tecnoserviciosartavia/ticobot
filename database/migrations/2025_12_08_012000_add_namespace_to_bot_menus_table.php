<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
	public function up(): void
	{
		if (!Schema::hasTable('bot_menus')) {
			return;
		}

		if (Schema::hasColumn('bot_menus', 'namespace')) {
			return;
		}

		Schema::table('bot_menus', function (Blueprint $table) {
			$table->string('namespace')->nullable()->after('name');
		});
	}

	public function down(): void
	{
		if (!Schema::hasTable('bot_menus')) {
			return;
		}

		if (!Schema::hasColumn('bot_menus', 'namespace')) {
			return;
		}

		Schema::table('bot_menus', function (Blueprint $table) {
			$table->dropColumn('namespace');
		});
	}
};
