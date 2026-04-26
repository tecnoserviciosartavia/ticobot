# Plan de correcciones — Conciliaciones y Pagos

## Excluido (por ser prepago)
- ❌ No tocar reprogramación de recordatorios ni `next_due_date` de contratos

---

## Correcciones a implementar

### 1. `ConciliationController::store()` — Generar `unique_conciliation_key`
**Archivo:** `app/Http/Controllers/Web/ConciliationController.php`
- Al crear conciliación manual, generar key con `ConciliationKeyService::generateKey()`
- También setear `channel = 'manual'`

### 2. `ConciliationController::store()` — `verified_at` automático en aprobaciones
**Archivo:** `app/Http/Controllers/Web/ConciliationController.php`
- Si `status === 'approved'`, usar `now()` como `verified_at`

### 3. `ConciliationController::store()` — Transacción de base de datos
**Archivo:** `app/Http/Controllers/Web/ConciliationController.php`
- Envolver creación de conciliación + update de pago + metadata + PDF + WhatsApp en `DB::transaction()`

### 4. `SinpeBcrEmailConciliationService::ensureConciliationInReview()` — Key única
**Archivo:** `app/Services/SinpeBcrEmailConciliationService.php`
- Generar `unique_conciliation_key` y setear `channel = 'sinpe_email'` al crear conciliación desde correo

### 5. `SinpeBcrEmailConciliationService::findOpenPaymentWithoutReference()` — Fechas consistentes
**Archivo:** `app/Services/SinpeBcrEmailConciliationService.php`
- Usar strings `toDateTimeString()` en ambos `whereBetween` para consistencia

### 6. `resources/js/Pages/Payments/Index.tsx` — Limpiar CSS duplicado
**Archivo:** `resources/js/Pages/Payments/Index.tsx`
- Remover clases Tailwind duplicadas (`dark:bg-gray-800`, `dark:border-gray-600`, etc.)

---

## Archivos a editar
1. `app/Http/Controllers/Web/ConciliationController.php`
2. `app/Services/SinpeBcrEmailConciliationService.php`
3. `resources/js/Pages/Payments/Index.tsx`

