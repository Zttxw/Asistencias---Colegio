# Criterios de Aceptación — Fase 2: Prototipo de Sincronización (Vertical Slice)

Este documento registra formalmente la verificación técnica de los 9 criterios exigidos para la Fase 2 del plan v3.2. Cada criterio cuenta con evidencia reproducible y verificable.

---

## Tabla de Criterios

| Criterio | Descripción | Evidencia | Estado |
| :---: | :--- | :--- | :---: |
| **1** | **Offline → reconnect**<br>Operación creada sin conexión se almacena localmente y viaja a PostgreSQL al volver online. | Test Playwright `Escenario A` (`frontend/e2e/offline-sync.spec.ts`) + Verificación directa en BD con `psql` (1 sesión y 1 asistencia persistidas con estado `ABSENT`). | ☑ Cumplido |
| **2** | **Reenvío idempotente y protección ante reenvío tardío / reinicio de contador**<br>Reenviar lote con datos idénticos responde `duplicate`. Paquetes viejos o reinicios con datos distintos y `localRev <= last_device_rev` responden `conflict` con `current`, impidiendo pérdidas silenciosas de datos. | Test Playwright `Escenario B` + Test xUnit `Push_ResendExactSameBatch_ReturnsDuplicate_NoChanges`, `Push_DelayedRetryWithLowerLocalRevAndSameData_ReturnsDuplicate_NoChanges`, `Push_DelayedRetryWithLowerLocalRevAndDifferentData_ReturnsConflict_DoesNotOverwriteNewerEdit` y `Push_SameDevice_ResetLocalRevWithDifferentData_ReturnsConflict`. | ☑ Cumplido |
| **3** | **Reloj incorrecto (pasado y futuro)**<br>Tablet con reloj desfasado décadas atrás (año 2001) o adelante (año 2045) no altera la autoridad de tiempo del servidor (`created_at`, `updated_at`, `server_change_id`). | Test Playwright `Escenario E` (reloj en año 2001 y 2045): `attendance_records.updated_at` asignado en 2026 por el servidor, preservando `client_updated_at` como metadato. | ☑ Cumplido |
| **4** | **Cierre a mitad de sync / corte de ACK en vuelo**<br>Petición procesada en servidor pero con ACK cortado antes de llegar a la tablet: al reabrir la app los datos siguen en IndexedDB (`PENDING`) y reintentan sincronizar sin duplicarse ni generar falso conflicto (Regla 3b). | Test Playwright `Escenario C` (`route.fetch()` aplicado en servidor, `route.abort('failed')`, cierre de pestaña, reapertura y sincronización exitosa a `LATE`) + Regla 3b con `localRev`/`last_device_rev`. | ☑ Cumplido |
| **5** | **API detenida durante envío**<br>Caída del servidor (`docker compose stop api`) mantiene los registros en Dexie (`PENDING`), muestra indicador `🔴 Error de sincronización` y recupera al reiniciar la API. | Test Playwright `Escenario D` (`docker compose stop api` -> error visual -> `docker compose start api` -> click reintentar -> `SYNCED` con registro en PostgreSQL). | ☑ Cumplido |
| **6** | **Conflict por versión antigua y dispositivo ajeno intercalado**<br>Modificación con `baseVersion` antigua de un dispositivo ajeno es rechazada con `conflict` sin sobrescribir el registro del servidor, incluso si reenvía con `localRev` mayor. | Test xUnit `Push_ExistingWithOutdatedBaseVersion_ReturnsConflictWithCurrent`, `Push_LostAckChainContinuation_FromDifferentDevice_ReturnsConflict` y `Push_InterleavedOtherDevice_DevAResendsWithHigherLocalRev_ReturnsConflict`. | ☑ Cumplido |
| **7** | **Concurrencia real del endpoint**<br>Múltiples `POST /api/sync` concurrentes se serializan ordenadamente, sin duplicación de `server_change_id`, y consultas incrementales no presentan huecos. | Test xUnit `Push_ConcurrentEndpointRequests_SerializeCommits_AndNoGapsInIncrementalQuery` + Test `ConcurrentWriters_AreSerialized_IdsFollowCommitOrder_AndReaderNeverSeesGaps`. | ☑ Cumplido |
| **8** | **UUID de sesión duplicado**<br>Dos dispositivos creando una sesión para la misma sección, fecha y bloque: el segundo recibe `conflict` con el ID canónico, lo adopta y reasigna sus asistencias. | Test xUnit `Push_DuplicateSessionSlot_ReturnsConflictWithCanonicalSessionId` + Lógica de adopción de ID canónico probada en `syncClient.ts` (`syncOfflineData`). | ☑ Cumplido |
| **9** | **Tablet real + Tailscale + HTTPS**<br>Prueba interactiva del flujo en la tablet real del docente conectada mediante túnel Tailscale seguro y HTTPS. | Checklist de prueba manual de campo (ver detalles abajo). | ☐ Pendiente (Prueba manual de campo) |

---

## Detalle de Evidencias Técnicas

### 1. Pruebas Automatizadas E2E (Playwright)
Ejecutadas con Google Chrome nativo sobre entorno Dockerizado (`api` + `db` + `frontend`):
- Archivo: [`frontend/e2e/offline-sync.spec.ts`](file:///home/jeanpier/MePT/Asistence/frontend/e2e/offline-sync.spec.ts)
- Resultado: **5/5 tests aprobados (100% éxito)** en 9.5 segundos.

```text
Running 5 tests using 1 worker
  ✓  1 Escenario A: Sin conexión -> Crear asistencia -> Reconectar -> SYNCED en PostgreSQL (1.7s)
  ✓  2 Escenario B: Reenvío idempotente no crea duplicados en PostgreSQL ni incrementa versión (486ms)
  ✓  3 Escenario C: Cierre a mitad de sync (petición aplicada en servidor pero ACK cortado antes de llegar a la tablet) (1.1s)
  ✓  4 Escenario D: API detenida mantiene registros en PENDING/Error y recupera al reiniciar (4.2s)
  ✓  5 Escenario E: Reloj del navegador desfasado en pasado (2001) o futuro (2045) no altera la autoridad del servidor (943ms)

5 passed (9.5s)
```

### 2. Pruebas Unitarias y de Integración Backend (xUnit + PostgreSQL)
Ejecutadas con `docker compose run --rm tests`:
- Archivo: [`backend/Asistencia.Tests/SyncProtocolTests.cs`](file:///home/jeanpier/MePT/Asistence/backend/Asistencia.Tests/SyncProtocolTests.cs)
- Resultado: **31/31 tests aprobados (100% éxito)** en 4.9 segundos.

Casos destacados validados:
- `Push_DelayedRetryWithLowerLocalRevAndDifferentData_ReturnsConflict_DoesNotOverwriteNewerEdit`: Demuestra que un paquete rezagado con datos distintos responde `conflict` con `current` sin sobrescribir la edición más reciente en BD.
- `Push_DelayedRetryWithLowerLocalRevAndSameData_ReturnsDuplicate_NoChanges`: Si los datos son idénticos, responde `duplicate` (idempotencia pura).
- `Push_SameDevice_ResetLocalRevWithDifferentData_ReturnsConflict`: Ante reinicio de contador `localRev` a 1 con datos distintos, devuelve `conflict` en lugar de `duplicate`, impidiendo pérdidas silenciosas de ediciones.
- `Push_InterleavedOtherDevice_DevAResendsWithHigherLocalRev_ReturnsConflict`: Si A edita, B edita, y A reenvía con `localRev` mayor pero `baseVersion` vieja, el servidor rechaza con `conflict` y preserva la versión de B.
- `Push_LostAckChainContinuation_AcceptsWithoutFalseConflict`: Regla 3b sin falsos conflictos exclusivamente mediante `localRev`.
- `Push_ConcurrentEndpointRequests_SerializeCommits_AndNoGapsInIncrementalQuery`: Serialización real y sin huecos en cursor.
- `Push_DuplicateAttendanceLogicalKey_ReturnsConflictWithCanonicalRecord`: Detección de colisión por clave natural de asistencia.
- `Push_AttendanceBeforeSession_RejectsAttendanceWithoutOrphanRecord`: Integridad de orden en el lote.

---

### 3. Guía de Verificación de Campo — Criterio 9 (Tablet Real + Tailscale + HTTPS)
Para dar por completado el Criterio 9 en la prueba física con el docente, verificar:
1. **Mismo origen HTTPS (`tailscale serve`)**:
   Servir el frontend y la API bajo el mismo origen seguro (ej. `https://mi-nodo.ts.net`), evitando que el navegador bloquee peticiones por Mixed Content (HTTPS llamando a HTTP).
2. **Prueba desde red externa**:
   Verificar el funcionamiento conectando la tablet a datos móviles (red 4G/5G) o a una red Wi-Fi distinta a la de la PC de desarrollo, comprobando el túnel Tailscale en condiciones reales.
3. **Persistencia de Tailscale en reposo**:
   Verificar la configuración de ahorro de energía de Android en la tablet para evitar que el sistema operativo mate el proceso o desconecte la VPN de Tailscale cuando la pantalla se suspenda.

