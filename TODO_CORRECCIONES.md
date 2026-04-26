# TODO — Correcciones Conciliaciones y Pagos

- [x] 1. `ConciliationController::store()` — Generar `unique_conciliation_key` + `channel`
- [x] 2. `ConciliationController::store()` — `verified_at` automático si `status === 'approved'`
- [x] 3. `ConciliationController::store()` — Envolver en `DB::transaction()`
- [x] 4. `SinpeBcrEmailConciliationService::ensureConciliationInReview()` — Generar key + channel
- [x] 5. `SinpeBcrEmailConciliationService::findOpenPaymentWithoutReference()` — Fechas consistentes
- [ ] 6. `resources/js/Pages/Payments/Index.tsx` — Limpiar CSS duplicado

