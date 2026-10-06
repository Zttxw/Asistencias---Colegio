# Criterios de Aceptación — Fase 2: Prototipo de Sincronización (Vertical Slice)

Este documento registra formalmente la verificación técnica de los 9 criterios exigidos para la Fase 2 del plan v3.2. Cada criterio cuenta con evidencia reproducible y verificable.

---

## Tabla de Criterios

| Criterio | Descripción | Evidencia | Estado |
| :---: | :--- | :--- | :---: |
| **1** | **Offline → reconnect**<br>Operación creada sin conexión se almacena localmente y viaja a PostgreSQL al volver online. | Test Playwright `Escenario A` (`frontend/e2e/offline-sync.spec.ts`) + Verificación directa en BD con `psql` (1 sesión y 1 asistencia persistidas con estado `ABSENT`). | ☑ Cumplido |
| **2** | **Reenvío idempotente**<br>Reenviar exactamente el mismo lote responde `duplicate`, sin duplicar filas, sin alterar versiones ni generar entradas adicionales en `change_log`. | Test Playwright `Escenario B` + Test xUnit `Push_ResendExactSameBatch_ReturnsDuplicate_NoChanges` y `Push_SameDataDifferentMetadata_ReturnsDuplicate`. | ☑ Cumplido |
| **3** | **Reloj incorrecto**<br>Tablet con reloj desfasado varios años no altera la autoridad de tiempo del servidor (`created_at`, `updated_at`, `server_change_id`). | Test Playwright `Escenario E` (reloj de tablet en año 2045): `attendance_records.updated_at` asignado en 2026 por el servidor, preservando `client_updated_at` = 2045 como metadato. | ☑ Cumplido |
| **4** | **Cierre durante sync / recarga**<br>Cierre abrupto de la pestaña durante estado pendiente preserva los datos en IndexedDB y sincroniza al reabrir. Protección ante respuestas lentas con `localRev`. | Test Playwright `Escenario C` (`page.close()` y reapertura de contexto conservando estado `PENDING` antes de sincronizar) + Implementación de `localRev` en `db.ts` y `syncClient.ts`. | ☑ Cumplido |
| **5** | **API detenida durante envío**<br>Caída del servidor (`docker compose stop api`) mantiene los registros en Dexie (`PENDING`), muestra indicador `🔴 Error de sincronización` y recupera al reiniciar la API. | Test Playwright `Escenario D` (`docker compose stop api` -> error visual -> `docker compose start api` -> click reintentar -> `SYNCED` con registro en PostgreSQL). | ☑ Cumplido |
| **6** | **Conflict por versión antigua**<br>Modificación con `baseVersion` antigua es rechazada con `conflict` sin sobrescribir el registro del servidor. | Test xUnit `Push_ExistingWithOutdatedBaseVersion_ReturnsConflictWithCurrent` + Test de seguridad `Push_LostAckChainContinuation_FromDifferentDevice_ReturnsConflict`. | ☑ Cumplido |
| **7** | **Concurrencia real del endpoint**<br>Múltiples `POST /api/sync` concurrentes se serializan ordenadamente, sin duplicación de `server_change_id`, y consultas incrementales no presentan huecos. | Test xUnit `Push_ConcurrentEndpointRequests_SerializeCommits_AndNoGapsInIncrementalQuery` + Test `ConcurrentWriters_AreSerialized_IdsFollowCommitOrder_AndReaderNeverSeesGaps`. | ☑ Cumplido |
| **8** | **UUID de sesión duplicado**<br>Dos dispositivos creando una sesión para la misma sección, fecha y bloque: el segundo recibe `conflict` con el ID canónico, lo adopta y reasigna sus asistencias. | Test xUnit `Push_DuplicateSessionSlot_ReturnsConflictWithCanonicalSessionId` + Lógica de adopción de ID canónico probada en `syncClient.ts` (`syncOfflineData`). | ☑ Cumplido |
| **9** | **Tablet real + Tailscale + HTTPS**<br>Prueba interactiva del flujo en la tablet real del docente conectada mediante túnel Tailscale seguro y HTTPS. | Prueba manual de campo en dispositivo físico. | ☐ Pendiente (Prueba manual de campo) |

---

## Detalle de Evidencias Técnicas

### 1. Pruebas Automatizadas E2E (Playwright)
Ejecutadas con Google Chrome nativo sobre entorno Dockerizado (`api` + `db` + `frontend`):
- Archivo: [`frontend/e2e/offline-sync.spec.ts`](file:///home/jeanpier/MePT/Asistence/frontend/e2e/offline-sync.spec.ts)
- Resultado: **5/5 tests aprobados (100% éxito)** en 8.4 segundos.

```text
Running 5 tests using 1 worker
  ✓  1 Escenario A: Sin conexión -> Crear asistencia -> Reconectar -> SYNCED en PostgreSQL (894ms)
  ✓  2 Escenario B: Reenvío idempotente no crea duplicados en PostgreSQL ni incrementa versión (518ms)
  ✓  3 Escenario C: Cierre de pestaña/recarga durante estado pendiente y localRev protege cambios (989ms)
  ✓  4 Escenario D: API detenida mantiene registros en PENDING/Error y recupera al reiniciar (4.3s)
  ✓  5 Escenario E: Reloj del navegador desfasado años no altera la autoridad del servidor (697ms)

5 passed (8.4s)
```

### 2. Pruebas Unitarias y de Integración Backend (xUnit + PostgreSQL)
Ejecutadas con `docker compose run --rm tests`:
- Archivo: [`backend/Asistencia.Tests/SyncProtocolTests.cs`](file:///home/jeanpier/MePT/Asistence/backend/Asistencia.Tests/SyncProtocolTests.cs)
- Resultado: **27/27 tests aprobados (100% éxito)** en 4.0 segundos.

Casos destacados validados:
- `Push_ConcurrentEndpointRequests_SerializeCommits_AndNoGapsInIncrementalQuery`
- `Push_LostAckChainContinuation_AcceptsWithoutFalseConflict`
- `Push_LostAckChainContinuation_FromDifferentDevice_ReturnsConflict`
- `Push_SameDataDifferentMetadata_ReturnsDuplicate`
- `Push_DuplicateAttendanceLogicalKey_ReturnsConflictWithCanonicalRecord`
- `Push_AttendanceBeforeSession_RejectsAttendanceWithoutOrphanRecord`
- `GetChanges_ReturnsIncrementalEntities_AndDoesNotSkipCursor`

### 3. Conclusión de Fase 2
Con las 27 pruebas de backend y los 5 escenarios automatizados de Playwright en verde, queda formalmente demostrado que:
> *Una operación creada sin Internet permanece almacenada localmente en IndexedDB, sobrevive al cierre o recarga de la aplicación, se sincroniza cuando vuelve la conexión y termina exactamente una vez en PostgreSQL, incluso ante reintentos, pérdida de ACK, caída temporal del servidor, concurrencia y desfasaje de reloj.*
