<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProfileUpdateRequest;
use App\Support\WhatsAppStatus;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Redirect;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * @return array<string,bool>
     */
    private function defaultPushNotificationPreferences(): array
    {
        return [
            'daily_expected_payments' => true,
            'overdue_payments' => true,
            'platform_cost_due' => true,
            'conciliation_pending' => true,
            'whatsapp_manual_pause_events' => false,
        ];
    }

    /**
     * @param mixed $raw
     * @return array<string,bool>
     */
    private function normalizePushNotificationPreferences($raw): array
    {
        $defaults = $this->defaultPushNotificationPreferences();
        $stored = is_array($raw) ? $raw : [];

        $normalized = [];
        foreach ($defaults as $key => $default) {
            $normalized[$key] = isset($stored[$key]) ? (bool) $stored[$key] : $default;
        }

        return $normalized;
    }

    /**
     * Display the user's profile form.
     */
    public function edit(Request $request): Response
    {
        return Inertia::render('Profile/Edit', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => session('status'),
            'whatsapp' => WhatsAppStatus::snapshot(),
            'pushNotificationPreferences' => $this->normalizePushNotificationPreferences(
                $request->user()->push_notification_preferences
            ),
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $request->user()->fill($request->validated());

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $request->user()->save();

        return Redirect::route('profile.edit');
    }

    /**
     * Update push-notification preferences for the authenticated profile.
     */
    public function updatePushNotificationPreferences(Request $request): RedirectResponse
    {
        $defaults = $this->defaultPushNotificationPreferences();

        $rules = [];
        foreach (array_keys($defaults) as $key) {
            $rules[$key] = ['required', 'boolean'];
        }

        /** @var array<string,mixed> $validated */
        $validated = $request->validate($rules);

        $normalized = [];
        foreach ($defaults as $key => $default) {
            $normalized[$key] = isset($validated[$key]) ? (bool) $validated[$key] : $default;
        }

        $user = $request->user();
        $user->push_notification_preferences = $normalized;
        $user->save();

        return Redirect::route('profile.edit')->with('status', 'push-preferences-updated');
    }

    /**
     * Delete the user's account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validate([
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Redirect::to('/');
    }
}
