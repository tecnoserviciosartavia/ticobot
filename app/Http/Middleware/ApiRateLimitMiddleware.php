<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

class ApiRateLimitMiddleware
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string $maxAttempts = '60', string $decayMinutes = '1'): Response
    {
        $key = $this->resolveRequestSignature($request);
        
        if (RateLimiter::tooManyAttempts($key, $maxAttempts)) {
            return $this->buildResponse($key, $maxAttempts);
        }

        RateLimiter::hit($key, $decayMinutes * 60);

        $response = $next($request);

        // Add rate limit headers
        $response->headers->set('X-RateLimit-Limit', $maxAttempts);
        $response->headers->set('X-RateLimit-Remaining', max(0, $maxAttempts - RateLimiter::attempts($key)));
        $response->headers->set('X-RateLimit-Reset', RateLimiter::availableIn($key));

        return $response;
    }

    /**
     * Resolve rate-limit signature for the request.
     */
    protected function resolveRequestSignature(Request $request): string
    {
        // Use user ID if authenticated, otherwise IP
        if ($user = $request->user()) {
            return 'api:user:' . $user->id;
        }

        // For WhatsApp API, use phone number if available
        if ($phone = $request->route('phone')) {
            return 'api:phone:' . md5($phone);
        }

        // Fallback to IP
        return 'api:ip:' . $request->ip();
    }

    /**
     * Create a 'too many attempts' response.
     */
    protected function buildResponse(string $key, string $maxAttempts): Response
    {
        $retryAfter = RateLimiter::availableIn($key);
        
        return response()->json([
            'success' => false,
            'message' => 'Too many attempts. Please try again later.',
            'retry_after' => $retryAfter,
        ], 429)->withHeaders([
            'Retry-After' => $retryAfter,
            'X-RateLimit-Limit' => $maxAttempts,
            'X-RateLimit-Remaining' => 0,
            'X-RateLimit-Reset' => $retryAfter,
        ]);
    }
}
