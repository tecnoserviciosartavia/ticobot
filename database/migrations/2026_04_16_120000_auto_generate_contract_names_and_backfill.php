<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('contracts')
            ->orderBy('id')
            ->select('id')
            ->chunkById(500, function ($rows): void {
                foreach ($rows as $row) {
                    $id = (int) $row->id;
                    $autoName = 'CONTRATO-'.str_pad((string) $id, 6, '0', STR_PAD_LEFT);

                    DB::table('contracts')
                        ->where('id', $id)
                        ->update(['name' => $autoName]);
                }
            });

        Schema::table('contracts', function (Blueprint $table): void {
            $table->unique('name', 'contracts_name_unique_auto');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table): void {
            $table->dropUnique('contracts_name_unique_auto');
        });
    }
};
