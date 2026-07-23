<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Default send time for reminders
    |--------------------------------------------------------------------------
    |
    | This value controls the time of day (HH:MM, 24h) when reminders that
    | are scheduled by date-only inputs will be normalized to. Example: "12:00".
    |
    */
    'send_time' => env('REMINDER_SEND_TIME', '12:00'),
];
