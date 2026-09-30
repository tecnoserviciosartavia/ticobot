<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\SinpeEmailController as WebSinpeEmailController;
use App\Models\SinpeEmailTransaction;
use App\Services\SinpeBcrEmailConciliationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileSinpeEmailController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = SinpeEmailTransaction::query()->with(['client:id,name', 'contract:id,name', 'payment:id,status', 'payment.conciliation:id,payment_id,status']);
        if ($request->filled('status')) $query->where('status', $request->string('status')->toString());
        if ($request->input('read') === 'read') $query->where('is_read', true);
        if ($request->input('read') === 'unread') $query->where('is_read', false);
        if ($search = $request->string('search')->trim()->toString()) {
            $query->where(fn ($q) => $q->where('origin_name', 'like', "%{$search}%")
                ->orWhere('origin_phone', 'like', "%{$search}%")->orWhere('motive', 'like', "%{$search}%")
                ->orWhere('reference', 'like', "%{$search}%")->orWhere('mail_subject', 'like', "%{$search}%"));
        }
        $items = $query->orderBy('is_read')->orderByDesc('performed_at')->limit(100)->get()->map(fn (SinpeEmailTransaction $item) => [
            'id' => $item->id, 'reference' => $item->reference, 'origin_phone' => $item->origin_phone,
            'origin_name' => $item->origin_name, 'motive' => $item->motive, 'amount' => $item->amount,
            'performed_at' => $item->performed_at?->toIso8601String(), 'mail_subject' => $item->mail_subject,
            'is_read' => (bool) $item->is_read, 'status' => $item->status, 'notes' => $item->notes,
            'client' => $item->client?->only(['id', 'name']), 'contract' => $item->contract?->only(['id', 'name']),
            'payment' => $item->payment ? [
                'id' => $item->payment->id,
                'status' => $item->payment->status,
                'conciliation' => $item->payment->conciliation ? [
                    'id' => $item->payment->conciliation->id,
                    'status' => $item->payment->conciliation->status,
                ] : null,
            ] : null,
        ]);
        return response()->json(['data' => $items]);
    }

    public function sync(SinpeBcrEmailConciliationService $service): JsonResponse
    {
        $service->syncMailbox();
        return response()->json(['ok' => true, 'message' => 'Correos SINPE actualizados.']);
    }

    public function markRead(int $id, WebSinpeEmailController $web): JsonResponse
    {
        $web->markRead($id);
        return response()->json(['ok' => true]);
    }

    public function conciliate(Request $request, int $id, WebSinpeEmailController $web): JsonResponse
    {
        $web->conciliate($request, $id);
        return response()->json(['ok' => true, 'message' => 'Transacción enviada a revisión correctamente.', 'data' => SinpeEmailTransaction::findOrFail($id)]);
    }

    public function destroy(int $id, WebSinpeEmailController $web): JsonResponse
    {
        $web->destroy($id);
        if (SinpeEmailTransaction::query()->whereKey($id)->exists()) {
            return response()->json(['message' => 'No se pudo eliminar el correo del buzón IMAP.'], 422);
        }
        return response()->json(['ok' => true]);
    }
}