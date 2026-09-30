<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller; use App\Http\Controllers\Web\ServiceController as WebServiceController; use App\Http\Controllers\Web\ServiceAccountController; use App\Models\Company; use App\Models\Service; use App\Models\ServiceAccount; use Illuminate\Http\JsonResponse; use Illuminate\Http\Request;
class MobileServiceController extends Controller {
 public function index(): JsonResponse { return response()->json(['data'=>Service::with('accounts')->orderBy('name')->get()]); }
 public function store(Request $r, WebServiceController $web): JsonResponse { if (! $r->filled('company_id')) { $r->merge(['company_id' => Company::query()->where('is_active', true)->orderBy('id')->value('id')]); } $web->store($r); return response()->json(['ok'=>true],201); }
 public function update(Request $r, Service $service, WebServiceController $web): JsonResponse { $web->update($r,$service); return response()->json(['ok'=>true]); }
 public function destroy(Service $service, WebServiceController $web): JsonResponse { $web->destroy($service); return response()->json(['ok'=>true]); }
 public function storeAccount(Request $r, ServiceAccountController $web): JsonResponse { $web->store($r); return response()->json(['ok'=>true],201); }
 public function destroyAccount(ServiceAccount $account, ServiceAccountController $web): JsonResponse { $web->destroy($account); return response()->json(['ok'=>true]); }
}
