<?php

namespace App\Http\Middleware;

use App\Models\WhatsappChatMessage;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the root template based on the request.
     */
    public function rootView(Request $request): string
    {
        // Debug: Log the current path
        \Log::info('Current path: ' . $request->path());
        \Log::info('Is login: ' . ($request->is('login') ? 'true' : 'false'));
        \Log::info('Is register: ' . ($request->is('register') ? 'true' : 'false'));
        
        // Use auth layout for authentication pages - expanded detection
        $authPaths = ['login', 'register', 'logout', 'password/request', 'password/email', 
                     'password/reset', 'password/confirm', 'email/verify', 'email/verification-notification'];
        
        foreach ($authPaths as $path) {
            if ($request->is($path) || $request->is($path . '/*')) {
                \Log::info('Using auth layout for: ' . $path);
                return 'auth';
            }
        }

        // Also check if the path starts with common auth prefixes
        if (str_starts_with($request->path(), 'login') || 
            str_starts_with($request->path(), 'register') || 
            str_starts_with($request->path(), 'password') || 
            str_starts_with($request->path(), 'email')) {
            \Log::info('Using auth layout for path prefix: ' . $request->path());
            return 'auth';
        }

        \Log::info('Using app layout for: ' . $request->path());
        return 'app';
    }

    /**
     * Determine the current asset version.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        // Fix CSRF token mismatch by updating APP_URL and session domain dynamically
        if (app()->environment('local') || app()->environment('production')) {
            $host = $request->getSchemeAndHttpHost();
            $hostOnly = $request->getHost();
            
            // Update APP_URL
            config(['app.url' => $host]);
            
            // Update session domain to match current host
            config(['session.domain' => $hostOnly]);
            
            // Update session path and security settings
            config(['session.path' => '/']);
            config(['session.secure' => $request->secure()]);
            config(['session.http_only' => true]);
            config(['session.same_site' => 'lax']);
        }
        
        return [
            ...parent::share($request),
            'auth' => [
                'user' => $request->user(),
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
                'mail_status' => fn () => $request->session()->get('mail_status'),
            ],
            'push' => [
                'web_public_key' => fn () => config('services.webpush.public_key'),
            ],
            'notifications' => fn () => [
                'unread_chats' => $request->user()
                    ? WhatsappChatMessage::query()
                        ->where('direction', 'inbound')
                        ->where('status', 'received')
                        ->distinct()
                        ->count('phone')
                    : 0,
            ],
        ];
    }
}
