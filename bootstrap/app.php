<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Usar middleware CSRF personalizado que excluye debug endpoints
        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        // Sanctum stateful API: permite autenticación por cookie en rutas /api
        $middleware->statefulApi();

        // Trust all proxies for reverse proxy setup
        $middleware->trustProxies(at: '*');

        $middleware->alias([
            'admin' => \App\Http\Middleware\EnsureIsAdmin::class,
        ]);
        
        // Temporarily disable CSRF middleware completely
        $middleware->remove('App\Http\Middleware\VerifyCsrfToken', 'web');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
