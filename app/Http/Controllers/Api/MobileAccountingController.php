<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller; use App\Http\Controllers\Web\AccountingController; use App\Http\Controllers\Web\FinancialOperationsController; use App\Models\Service; use App\Models\Reminder; use Illuminate\Http\JsonResponse; use Illuminate\Http\Request; use Illuminate\Support\Carbon;
class MobileAccountingController extends Controller {
 public function indicators(Request $r, AccountingController $accounting):JsonResponse { $month=preg_match('/^\d{4}-\d{2}$/',(string)$r->query('month'))?(string)$r->query('month'):now()->format('Y-m');$start=Carbon::createFromFormat('Y-m-d',$month.'-01')->startOfMonth();return response()->json(['data'=>$accounting->calculateServiceProfits($start,$start->copy()->endOfMonth()),'month'=>$month]); }
 public function clients(Request $r, AccountingController $accounting):JsonResponse { return $accounting->serviceClients($r); }
 public function delinquencies(AccountingController $accounting):JsonResponse { $start=now()->startOfMonth();return response()->json(['data'=>$accounting->clientsWithSentRemindersWithoutVerifiedPayments($start,$start->copy()->endOfMonth())]); }
 public function dismiss(Request $request, Reminder $reminder, FinancialOperationsController $finance):JsonResponse { $response=$finance->dismissDelinquency($request,$reminder);return $response instanceof JsonResponse?$response:response()->json(['message'=>'No se pudo archivar el período.'],422); }
}
