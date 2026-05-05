<?php

namespace Tests\Unit\Services;

use Tests\TestCase;
use App\Models\Client;
use App\Models\Contract;
use App\Services\ContractImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Carbon\Carbon;

class ContractImportServiceTest extends TestCase
{
    use RefreshDatabase;

    protected ContractImportService $importService;
    protected Client $client;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->importService = new ContractImportService();
        
        $this->client = Client::factory()->create([
            'phone' => '+50612345678',
            'email' => 'test@example.com',
            'name' => 'Test Client',
        ]);
    }

    /** @test */
    public function it_imports_contracts_from_csv_data()
    {
        $csvData = [
            ['client_email', 'name', 'amount', 'currency', 'billing_cycle', 'next_due_date'],
            ['test@example.com', 'Test Contract 1', '100.00', 'USD', 'monthly', '2024-12-15'],
            ['test@example.com', 'Test Contract 2', '50.00', 'CRC', 'weekly', '2024-12-10'],
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(2, $result['created']);
        $this->assertEquals(0, $result['updated']);
        $this->assertEquals(0, $result['skipped']);
        $this->assertEmpty($result['errors']);

        $this->assertDatabaseCount('contracts', 2);
        
        $contract1 = Contract::where('name', 'Test Contract 1')->first();
        $this->assertEquals(100.00, $contract1->amount);
        $this->assertEquals('USD', $contract1->currency);
        $this->assertEquals('monthly', $contract1->billing_cycle);
        $this->assertEquals($this->client->id, $contract1->client_id);
    }

    /** @test */
    public function it_updates_existing_contracts()
    {
        // Create existing contract
        Contract::create([
            'client_id' => $this->client->id,
            'name' => 'Existing Contract',
            'amount' => 50.00,
            'currency' => 'USD',
            'billing_cycle' => 'monthly',
            'next_due_date' => '2024-12-15',
        ]);

        $csvData = [
            ['client_email', 'name', 'amount', 'currency', 'billing_cycle', 'next_due_date'],
            ['test@example.com', 'Existing Contract', '75.00', 'USD', 'weekly', '2024-12-20'],
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(0, $result['created']);
        $this->assertEquals(1, $result['updated']);
        $this->assertEquals(0, $result['skipped']);

        $contract = Contract::where('name', 'Existing Contract')->first();
        $this->assertEquals(75.00, $contract->amount);
        $this->assertEquals('weekly', $contract->billing_cycle);
        $this->assertEquals('2024-12-20', $contract->next_due_date);
    }

    /** @test */
    public function it_skips_rows_with_invalid_data()
    {
        $csvData = [
            ['client_email', 'name', 'amount', 'currency', 'billing_cycle'],
            ['test@example.com', 'Valid Contract', '100.00', 'USD', 'monthly'],
            ['invalid@example.com', 'Invalid Contract', '', 'USD', 'monthly'], // Missing amount
            ['test@example.com', 'Another Valid', '50.00', 'CRC', 'weekly'],
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(2, $result['created']);
        $this->assertEquals(0, $result['updated']);
        $this->assertEquals(1, $result['skipped']);
        $this->assertCount(1, $result['errors']);
    }

    /** @test */
    public function it_handles_missing_clients()
    {
        $csvData = [
            ['client_email', 'name', 'amount', 'currency', 'billing_cycle'],
            ['nonexistent@example.com', 'Orphan Contract', '100.00', 'USD', 'monthly'],
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(0, $result['created']);
        $this->assertEquals(0, $result['updated']);
        $this->assertEquals(1, $result['skipped']);
        $this->assertCount(1, $result['errors']);
        $this->assertStringContains('Cliente no encontrado', $result['errors'][0]);
    }

    /** @test */
    public function it_finds_clients_by_phone_number()
    {
        $csvData = [
            ['client_phone', 'name', 'amount', 'currency', 'billing_cycle'],
            ['12345678', 'Phone Contract', '100.00', 'USD', 'monthly'],
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(1, $result['created']);
        $this->assertEquals(0, $result['updated']);
        $this->assertEquals(0, $result['skipped']);

        $contract = Contract::where('name', 'Phone Contract')->first();
        $this->assertEquals($this->client->id, $contract->client_id);
    }

    /** @test */
    public function it_computes_next_due_date_when_missing()
    {
        $csvData = [
            ['client_email', 'name', 'amount', 'currency', 'billing_cycle'],
            ['test@example.com', 'No Due Date Contract', '100.00', 'USD', 'weekly'],
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(1, $result['created']);
        
        $contract = Contract::where('name', 'No Due Date Contract')->first();
        $expectedDate = Carbon::today()->addDays(7)->format('Y-m-d');
        $this->assertEquals($expectedDate, $contract->next_due_date->format('Y-m-d'));
    }

    /** @test */
    public function it_normalizes_phone_numbers()
    {
        $csvData = [
            ['client_phone', 'name', 'amount', 'currency', 'billing_cycle'],
            ['+50612345678', 'Full Phone Contract', '100.00', 'USD', 'monthly'],
            ['12345678', 'Short Phone Contract', '50.00', 'USD', 'weekly'],
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(2, $result['created']);
        $this->assertEquals(0, $result['updated']);
        $this->assertEquals(0, $result['skipped']);
    }

    /** @test */
    public function it_handles_different_column_names()
    {
        $csvData = [
            ['cliente_email', 'nombre', 'monto', 'moneda', 'ciclo_facturacion'],
            ['test@example.com', 'Spanish Contract', '100.00', 'CRC', 'mensual'],
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(1, $result['created']);
        
        $contract = Contract::where('name', 'Spanish Contract')->first();
        $this->assertEquals(100.00, $contract->amount);
        $this->assertEquals('CRC', $contract->currency);
        $this->assertEquals('mensual', $contract->billing_cycle);
    }

    /** @test */
    public function it_validates_required_fields()
    {
        $csvData = [
            ['client_email', 'name', 'amount', 'currency', 'billing_cycle'],
            ['test@example.com', '', '100.00', 'USD', 'monthly'], // Missing name
            ['test@example.com', 'Valid Contract', '', 'USD', 'monthly'], // Missing amount
        ];

        $file = $this->createMockCsvFile($csvData);
        $result = $this->importService->importFromFile($file);

        $this->assertEquals(0, $result['created']);
        $this->assertEquals(0, $result['updated']);
        $this->assertEquals(2, $result['skipped']);
        $this->assertCount(2, $result['errors']);
    }

    /**
     * Create a mock CSV file for testing
     */
    protected function createMockCsvFile(array $data): UploadedFile
    {
        $csv = '';
        foreach ($data as $row) {
            $csv .= implode(',', $row) . "\n";
        }

        $tempFile = tmpfile();
        fwrite($tempFile, $csv);
        $meta = stream_get_meta_data($tempFile);
        $filename = $meta['uri'];

        return new UploadedFile(
            $filename,
            'test.csv',
            'text/csv',
            null,
            true
        );
    }
}
