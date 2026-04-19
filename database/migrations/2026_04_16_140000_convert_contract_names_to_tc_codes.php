<?php

use App\Models\Contract;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function (): void {
            Contract::query()
                ->withTrashed()
                ->orderBy('id')
                ->select('id')
                ->chunkById(200, function ($contracts): void {
                    foreach ($contracts as $contract) {
                        DB::table('contracts')
                            ->where('id', $contract->id)
                            ->update(['name' => Contract::buildCodeFromId((int) $contract->id)]);
                    }
                });
        });
    }

    public function down(): void
    {
        // Irreversible: no se preservan los nombres previos.
    }
};
