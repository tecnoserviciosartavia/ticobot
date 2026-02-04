<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $table = 'app_settings';

    protected $fillable = [
        'key',
        'value',
        'description'
    ];

    public $timestamps = true;

    public static function get(string $key, $default = null)
    {
        $s = static::where('key', $key)->first();
        return $s ? $s->value : $default;
    }

    public static function set(string $key, $value, string $description = null)
    {
        return static::updateOrCreate(['key' => $key], ['value' => $value, 'description' => $description]);
    }
}
