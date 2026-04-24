<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\WhatsappChatMessage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ChatController extends Controller
{
    /**
     * Lista de conversaciones (una entrada por número de teléfono).
     */
    public function index(): Response
    {
        $conversations = WhatsappChatMessage::latestPerPhone();

        // Enriquecer con nombre del cliente si existe
        $phones = $conversations->pluck('phone')->all();
            $clients = Client::whereIn('phone', $phones)
                ->select('id', 'name', 'phone')
            ->get()
                ->keyBy('phone');

        $conversations = $conversations->map(function ($row) use ($clients) {
            $client = $clients->get($row->phone);
            return [
                'phone'           => $row->phone,
                'client_name'     => $client?->name,
                'client_id'       => $client?->id,
                'last_body'       => $row->last_body,
                'last_direction'  => $row->last_direction,
                'last_message_at' => $row->last_message_at,
                'unread_count'    => (int) $row->unread_count,
            ];
        });

        return Inertia::render('Chats/Index', [
            'conversations' => $conversations->values(),
        ]);
    }

    /**
     * Hilo de mensajes para un número de teléfono.
     */
    public function show(string $phone): Response
    {
        $messages = WhatsappChatMessage::where('phone', $phone)
            ->orderBy('created_at')
            ->get(['id', 'phone', 'direction', 'body', 'status', 'sent_by_user_id', 'sent_at', 'created_at']);

            $client = Client::where('phone', $phone)->first(['id', 'name', 'phone']);

        return Inertia::render('Chats/Show', [
            'phone'    => $phone,
            'client'   => $client,
            'messages' => $messages->values(),
        ]);
    }

    /**
     * Enviar un mensaje de salida (lo pone en cola para que el bot lo despache).
     */
    public function reply(Request $request, string $phone): RedirectResponse
    {
        $request->validate([
            'body' => ['required', 'string', 'max:4096'],
        ]);

        WhatsappChatMessage::create([
            'phone'           => $phone,
            'direction'       => 'outbound',
            'body'            => $request->input('body'),
            'status'          => 'queued',
            'sent_by_user_id' => $request->user()->id,
            'sent_at'         => null,
        ]);

        return back()->with('success', 'Mensaje en cola para enviar.');
    }
}
