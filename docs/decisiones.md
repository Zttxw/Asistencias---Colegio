# Registro de decisiones

Decisiones pequeñas tomadas durante la implementación. No modifican la arquitectura del plan
([plan-v3.2.md](plan-v3.2.md)). Formato: **DEC-NNN — título**, fecha, contexto, decisión.

---

## DEC-001 — .NET 10 LTS ejecutado vía Docker
- **Fecha:** 2026-10-05
- **Contexto:** el host no tiene SDK de .NET (sí Node 22.22, Docker 29, Compose v5). .NET 9 es STS y su soporte termina en noviembre de 2026.
- **Decisión:** usar .NET 10 (LTS). Todo comando `dotnet` corre en `mcr.microsoft.com/dotnet/sdk:10.0` mediante [`scripts/dotnet.sh`](../scripts/dotnet.sh). Resuelve la pregunta abierta 3.

## DEC-002 — Raíz del repositorio
- **Fecha:** 2026-10-05
- **Decisión:** la raíz del repo es el directorio del workspace (`Asistence/`), equivalente a `asistencia/` en la sección 11 del plan.

## DEC-003 — Enmiendas de la revisión que se incorporan al modelo en la Fase 1
- **Fecha:** 2026-10-05
- **Contexto:** la revisión del plan v3.2 detectó huecos que cuestan poco ahora y mucho después.
- **Decisión:** se incorporan al esquema inicial (la lógica que las usa llega en la Fase 2+):
  - `section_teachers(section_id, teacher_id)` — relación docente ↔ sección (revisión I4).
  - `enrollments.status (ACTIVE/WITHDRAWN)`, `start_date`, `end_date NULL`. El índice único `(student_id, academic_year_id)` pasa a ser **parcial** `WHERE status = 'ACTIVE'` (I8).
  - `class_sessions` y `attendance_records` llevan `last_device_id` y `chain_base_version` para evitar el conflicto falso por ACK perdido (I1).
  - `class_sessions` lleva `voided_at` y `voided_by`, igual que `attendance_records` (M1).
  - `change_log.previous_status` (nullable) para facilitar la métrica de errores y la auditoría futura (M10).
- **Pendientes para fases posteriores:** `refresh_tokens` (Fase 4, M5), `protocolVersion` (Fase 2, I10).

## DEC-004 — Enums guardados como texto con CHECK
- **Fecha:** 2026-10-05
- **Decisión:** los estados (`role`, `status`, `operation`, etc.) se guardan como `text` legible, con restricción `CHECK`. Cambiar los valores [PROVISIONAL] = editar el enum de C# y crear una migración.

## DEC-005 — Nombres snake_case sin dependencias extra
- **Fecha:** 2026-10-05
- **Decisión:** las tablas y columnas se nombran en snake_case con un convertidor propio de unas líneas en `AppDbContext`, en lugar de añadir `EFCore.NamingConventions`.

## DEC-006 — Seed por código, registrando en `change_log`
- **Fecha:** 2026-10-05
- **Contexto:** con `HasData`, los datos semilla no pasan por `change_log` y la bajada inicial (`cursor=0`) no los entregaría (revisión I3).
- **Decisión:** el seed corre al arrancar la API (si `Seed__Enabled=true` y la BD está vacía) y escribe en `change_log` mediante el mismo `ChangeLogWriter` que usará la sincronización y la importación.

## DEC-007 — Orden de bloqueos en las transacciones de cambio
- **Fecha:** 2026-10-05
- **Contexto:** riesgo de deadlock entre el bloqueo de fila de `sync_cursor` y los bloqueos de índices únicos (revisión I2).
- **Decisión:** toda transacción de escritura que registre cambios empieza con `SELECT value FROM sync_cursor WHERE id = 1 FOR UPDATE` (`ChangeLogWriter.LockAsync`). Así todos los escritores quedan serializados desde el inicio, y los SELECT previos de unicidad no tienen carreras. Los IDs se asignan con `UPDATE sync_cursor SET value = value + 1 WHERE id = 1 RETURNING value`, dentro de la misma transacción.

## DEC-008 — Migraciones al arrancar
- **Fecha:** 2026-10-05
- **Decisión:** en el piloto, la API aplica las migraciones pendientes al iniciar (`Database__MigrateOnStartup=true`). En 2027 se evaluará aplicarlas con un paso de despliegue separado.

## DEC-009 — Tests contra PostgreSQL real, sin Testcontainers
- **Fecha:** 2026-10-05
- **Contexto:** los índices únicos, los índices parciales y el orden de bloqueos no se pueden probar con InMemory/SQLite. Testcontainers dentro de un contenedor exigiría montar el socket de Docker.
- **Decisión:** los tests leen `TEST_DATABASE_URL`, crean una base temporal por clase de prueba (`asistencia_test_<guid>`), aplican las migraciones y la borran al terminar. Se ejecutan con `docker compose run --rm tests`, contra el servicio `db`.

## DEC-010 — Tipos de fecha y hora
- **Fecha:** 2026-10-05
- **Decisión:** `class_sessions.date`, `academic_years.*_date`, `non_school_days.date` y las fechas de matrícula son `date` (`DateOnly`). Las marcas de tiempo (`created_at`, `updated_at`, `voided_at`, `client_updated_at`) son `timestamptz` en UTC. Las asigna el servidor, salvo `client_updated_at`, que es solo informativo. La zona horaria de negocio es `America/Lima`.

## DEC-011 — Hash de contraseñas
- **Fecha:** 2026-10-05
- **Decisión:** se usa `PasswordHasher<T>` de ASP.NET Core Identity (incluido en el framework compartido, sin paquete extra). La contraseña del usuario semilla viene de `Seed__TeacherPassword` (variable de entorno).

## DEC-012 — PostgreSQL 17
- **Fecha:** 2026-10-05
- **Decisión:** imagen `postgres:17-alpine`, con volumen nombrado `pgdata` montado en `/var/lib/postgresql/data`.

## DEC-013 — Protocolo de sincronización, regla 3b (chain_base_version) y persistencia
- **Fecha:** 2026-10-06
- **Contexto:** En escenarios de conectividad inestable, una tablet offline puede modificar un registro múltiples veces consecutivas (ej. Falta médica → Tardanza justificada). Si la primera modificación llega al servidor y se aplica, pero el ACK HTTP de vuelta se pierde por corte de red, la tablet conserva una `baseVersion` antigua. Cuando la segunda modificación llega al servidor, una verificación estricta de `item.BaseVersion == existing.Version` provocaría un falso conflicto (`conflict`), rechazando una edición legítima del mismo docente.
- **Decisión:** Implementar y formalizar la Regla 3b mediante la tupla `(chain_base_version, device_id)`:
  - **Campos:** `chain_base_version` (integer, NOT NULL, default 0) y `device_id` (uuid, nullable).
  - **Tablas:** `class_sessions` y `attendance_records`.
  - **Significado:**
    - `chain_base_version`: Almacena la versión base con la que el cliente comenzó su cadena de modificaciones.
    - `device_id`: Identifica unívocamente la tablet que produjo la última versión aceptada del registro.
  - **Ciclo de vida:**
    - *Establecimiento (INSERT):* Al crear el registro en el servidor, `chain_base_version = item.BaseVersion` (usualmente 0) y `device_id = request.DeviceId`.
    - *Actualización regular (UPDATE con baseVersion == version):* Cuando llega una modificación normal, `chain_base_version = item.BaseVersion` y `device_id = request.DeviceId`.
    - *Continuación de cadena (UPDATE bajo Regla 3b):* Si `item.BaseVersion < version`, pero `existing.DeviceId == request.DeviceId` y `item.BaseVersion == existing.ChainBaseVersion`, se acepta (`accepted`), se incrementa `existing.Version += 1` y se preserva `existing.ChainBaseVersion` para permitir continuaciones subsiguientes si la conexión sigue inestable.
    - *Limpieza / Sobrescritura:* Se reemplaza naturalmente cuando cualquier cliente envía una modificación sincronizada con `baseVersion == existing.Version`.
  - **Seguridad y prevención de conflictos:**
    - La regla 3b **solo** aplica si `existing.DeviceId == request.DeviceId`.
    - Si un dispositivo B envía una modificación con `baseVersion` antigua (`existing.DeviceId != request.DeviceId`), el servidor devuelve estrictamente `conflict` con el registro canónico actual (`current`), impidiendo cualquier sobrescritura de datos por dispositivos no sincronizados.

