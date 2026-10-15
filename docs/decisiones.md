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

## DEC-014 — Protección contra reenvíos tardíos y fortalecimiento de la Regla 3b vía localRev / last_device_rev
- **Fecha:** 2026-10-06
- **Contexto:** En redes intermitentes, si una tablet envía una edición 1 (cuyo ACK se pierde) y luego realiza y sincroniza una edición 2, un paquete rezagado en vuelo de la edición 1 que llegue después traería el mismo `deviceId` y `baseVersion`. Si solo se evaluara `chain_base_version`, la edición 1 vieja podría aplicarse sobre la edición 2 más reciente, sobrescribiéndola en silencio.
- **Decisión:** Utilizar el contador de secuencia local `localRev` que la tablet ya incrementa en cada edición, enviándolo en cada ítem de `POST /sync`, y persistir `last_device_rev` en el servidor:
  - **Campos:** `last_device_rev` (integer NOT NULL DEFAULT 0) en `class_sessions` y `attendance_records`.
  - **Lógica aplicada en SyncProcessor:**
    - Si `existing.DeviceId == request.DeviceId`:
      - Si `item.LocalRev <= existing.LastDeviceRev`: se detecta como reenvío tardío o paquete desfasado en red. Se responde `duplicate` sin tocar el registro, versión ni `change_log`.
      - Si `item.LocalRev > existing.LastDeviceRev`: es una edición estrictamente más reciente. Se acepta (`accepted`), actualiza `last_device_rev = item.LocalRev`, incrementa `version += 1` y genera `change_log`.
    - Si `existing.DeviceId != request.DeviceId`:
      - Si `item.BaseVersion < existing.Version`: responde `conflict` con `current` (dispositivo ajeno desactualizado).
  - **Resultado:** Elimina el riesgo de sobrescrituras fuera de orden y preserva el orden causal de las modificaciones del docente.

## DEC-015 — Orden de Regla 3b ante datos distintos con localRev <= last_device_rev y retiro de chain_base_version
- **Fecha:** 2026-10-06
- **Contexto:** Si un dispositivo envía un ítem con datos distintos pero `localRev <= last_device_rev` (por ejemplo, reinicio de contador a 1 o paquete rezagado desfasado), responder `duplicate` provocaría que la tablet interprete la respuesta como confirmada y muestre 🟢 Sincronizado, produciendo pérdida silenciosa de ediciones en el servidor.
- **Decisión:**
  1. **Orden estricto de la regla en servidor:**
     - Primero se evalúa si los datos son idénticos (`IsDataEqual`). Si coinciden -> `duplicate` (idempotencia pura, sin tocar versión ni change log).
     - Si los datos son distintos y `existing.DeviceId == request.DeviceId` con `item.LocalRev <= existing.LastDeviceRev`: se responde `conflict` con `current` (no `duplicate`).
     - Si `existing.DeviceId == request.DeviceId` y `item.LocalRev > existing.LastDeviceRev`: es una edición más reciente tras ACK perdido (Regla 3b). Se acepta (`accepted`, `version += 1`, `last_device_rev = localRev`, `change_log`).
  2. **Almacenamiento conjunto en frontend:**
     - `deviceId` y `localRev` residen en el mismo almacén (IndexedDB / Dexie: `db.metadata` y tablas de entidades). Si el usuario borra datos del sitio, ambos se borran juntos y la tablet genera un nuevo `deviceId` (UUID fresco).
     - La tablet ignora respuestas rezagadas de `conflict`/`error` si `local.localRev !== snapshot._localRev` (hay edición local más reciente en vuelo). Si el contador se reinició, `local.localRev === snapshot._localRev` y el conflicto se hace visible en la UI.
  3. **Retiro de `chain_base_version` de las reglas:**
     - La regla 3b se evalúa exclusivamente mediante `isSameDevice && item.LocalRev > existing.LastDeviceRev`. `chain_base_version` no interviene en ninguna regla ni condición de sincronización.
  4. **Dispositivo intercalado garantizado:**
     - Si A edita, B edita (`existing.DeviceId = B`) y A reenvía con `localRev` mayor pero `baseVersion` antigua: como `existing.DeviceId != A`, no es continuación de cadena y responde `conflict` con `current` (edición de B).

## DEC-016 — Estrategia de importación de padrón, CLI administrativa, código secuencial y privacidad
- **Fecha:** 2026-10-06
- **Contexto:** La integración del padrón de alumnos desde el Excel requiere garantizar la estabilidad de las identidades de los menores, prevenir pérdidas o corrupciones de datos en base de datos, detectar anomalías de formato o posibles homónimos, evitar endpoints públicos no autenticados, y proteger la privacidad de los menores según la normativa vigente (Ley 29733).
- **Decisión:**
  1. **Herramienta administrativa CLI (Sin endpoints HTTP públicos):**
     - Se elimina cualquier endpoint público como `POST /api/roster/dry-run`.
     - El análisis y la importación son operaciones puramente administrativas invocadas por CLI:
       `cat padron.xlsx | docker compose exec -T api dotnet /app/Asistencia.Api.dll roster dry-run -`
       `docker compose exec api dotnet /app/Asistencia.Api.dll roster import <archivo.xlsx>`
  2. **Identidad del alumno desacoplada (`Code` secuencial, no hash):**
     - Se rechaza derivar el código del hash del nombre (`STU-{SHA256}`), ya que mezclaría identidad con datos personales mutables (ej. corrección ortográfica de apellido cambiaría el código).
     - El código se genera secuencialmente por institución (`STU-0001`, `STU-0002`...) y jamás se recalcula a partir del nombre.
  3. **Tres estados de resolución del importador (`NEW`, `MATCHED`, `AMBIGUOUS`):**
     - `NEW`: nuevo alumno registrado; se le asigna el siguiente código correlativo disponible.
     - `MATCHED`: alumno existente reconocido por nombre normalizado en la sección; conserva su `Id` y `Code` intactos.
     - `AMBIGUOUS`: duplicados o posibles homónimos; detiene la importación con rollback y emite alerta para revisión humana.
  4. **Protección contra borrados accidentales (Sin hard deletes):**
     - Si un alumno ya no figura en un nuevo Excel, **nunca se elimina de PostgreSQL**. Se conserva con estado activo para no romper el histórico de asistencia de sesiones previas. El importador emite una advertencia informativa.
  5. **Integración con ChangeLogWriter y sincronización:**
     - Toda sección, alumno y matrícula creada por el importador se registra en `change_log` mediante `ChangeLogWriter` dentro de una transacción. `GET /sync/changes` entrega inmediatamente los alumnos a la tablet.
  6. **Privacidad estricta y pruebas sintéticas (Ley 29733):**
     - Los reportes, logs y advertencias solo refieren ubicación física (ej. `Hoja 5C, Fila 11`), sin exponer nombres reales de menores.
     - El Excel real nunca se comitea (`.gitignore` incluye `*.xlsx`, `*.xls`). Las pruebas unitarias y de integración son 100% sintéticas con nombres ficticios.

## DEC-017 — Autorización de subida/bajada, rol Auxiliar, control SEED_DEMO, aislamiento de PILOT y avance paralelo a Fase 3
- **Fecha:** 2026-10-06
- **Contexto:** Al transicionar hacia la Fase 3, se requiere blindar la seguridad de escritura y lectura en la API sin modificar la lógica congelada de sincronización (`localRev` / `last_device_rev`), evitar la siembra accidental de datos ficticios en producción, aislar los entornos DEV y PILOT, y formalizar el avance en paralelo con la prueba física pendiente del Criterio 9.
- **Decisión:**
  1. **Autorización estricta en SUBIDA (`POST /api/sync`):**
     - **Docente (`TEACHER`):** Solo puede insertar o modificar `class_sessions` y `attendance_records` de secciones asignadas en `SectionTeachers`. Se valida tanto `class_session.section_id` como la relación indirecta `attendance_record -> class_session -> section`. Cualquier intento de inyectar UUIDs ajenos retorna `rejected` con mensaje explicativo, sin alterar entidades, versiones, `change_log` ni `sync_cursor`.
     - **Auxiliar (`AUXILIARY`):** Rol estrictamente de solo lectura operativa. Cualquier intento de ejecutar `POST /api/sync` es rechazado de inmediato (`rejected` / HTTP 403 Forbidden) sin modificar la base de datos.
  2. **Filtrado de padrón en BAJADA (`GET /api/sync/changes`):**
     - El servidor es la única autoridad de autorización.
     - Un docente solo descarga sus secciones asignadas, sus alumnos matriculados, sus sesiones y sus asistencias. No se confía en ningún parámetro del frontend.
     - Para evitar bloqueos o bucles infinitos en el cliente, `nextCursor` siempre avanza hasta el máximo `server_change_id` de la página consultada, omitiendo del payload los registros no autorizados.
     - El rol `AUXILIARY` recibe todas las secciones y registros de la institución, permitiéndole generar el consolidado de asistencia general del colegio a las 9:00 AM.
  3. **Control estricto de semillas con `SEED_DEMO`:**
     - La siembra de demostración (30 alumnos ficticios) NO se ejecuta automáticamente.
     - Solo se activa cuando `SEED_DEMO=true` está presente de forma explícita. Por defecto (`SEED_DEMO=false` o ausencia), el sistema arranca con 0 alumnos demo, 0 secciones demo y 0 entradas en `change_log`.
  4. **Avance en paralelo hacia Fase 3 y prerrequisito de Criterio Físico 9:**
     - Se autoriza avanzar en el desarrollo de la Fase 3 (Login, UI de asistencia y reportes) en paralelo con la validación de infraestructura del Criterio 9 (tablet física).
     - **Condición obligatoria:** El Criterio Físico 9 debe estar formalmente probado y aprobado antes de la Fase 4 y antes de iniciar el piloto real con alumnos reales.
  5. **Protección y separación estricta de DEV y PILOT:**
     - Los entornos DEV y PILOT utilizan bases de datos y volúmenes Docker completamente independientes.
     - Queda terminantemente **PROHIBIDO** ejecutar `docker compose down -v` sobre el entorno de PILOT.
     - Todo proceso de importación en PILOT debe estar precedido por un respaldo mediante `pg_dump` y verificación de restauración en entorno secundario.
  6. **Autenticación Fase 3 (Login y JWT):**
     - Implementado endpoint `POST /api/auth/login` con soporte para roles `TEACHER`, `AUXILIARY` y `ADMIN`.
     - Contraseñas almacenadas exclusivamente con PBKDF2 (`IPasswordHasher<User>`).
     - Tokens JWT con claims de identidad (`sub`), rol (`role`), nombre y `institution_id`.
     - CORS restringido al frontend (`http://localhost:5173`, `http://127.0.0.1:5173`).


## DEC-018 — Endurecimiento de Seguridad, Autorización, Aislamiento PILOT y Manejo de Errores de Sync
- **Fecha:** 2026-10-06
- **Contexto:** Antes de desplegar el flujo completo de asistencia de Fase 3 en la tablet y permitir la carga de padrones reales, se requiere cerrar los 16 puntos de verificación de seguridad, autorización e infraestructura, manteniendo el algoritmo central de sincronización (`localRev` / `last_device_rev`) completamente congelado.
- **Decisión:**
  1. **Resolución de sección de asistencia desde el servidor:**
     - La sección de un `attendance_record` se resuelve exclusivamente a través de la relación persistida `attendance_record -> session_id -> class_session -> section_id`.
     - Si el payload del cliente incluye un `sectionId` que discrepa con la sesión en el servidor, o si el docente autenticado no está asignado a la sección de la sesión, el registro se rechaza de inmediato (`rejected`).
  2. **Validación obligatoria de matrícula activa:**
     - Antes de aceptar cualquier `attendance_record`, el servidor verifica que el alumno cuente con un registro `Enrollment` con estado `Active` en la sección correspondiente a la sesión.
     - Alumnos matriculados en otra sección o sin matrícula son rechazados (`rejected`) sin modificar la sesión, registros de asistencia, versiones ni `change_log`.
  3. **Inmutabilidad y protección de `teacher_id` en sesiones:**
     - Un docente autenticado no puede crear una sesión asignada a otro docente ni modificar una sesión existente para cambiar su `teacher_id`.
     - El servidor es la autoridad de identidad y asigna el docente a partir de las credenciales autenticadas y las asignaciones de `SectionTeachers`.
  4. **Gestión de usuarios reales sin SEED_DEMO:**
     - Implementado comando CLI `dotnet /app/Asistencia.Api.dll user create` que solicita interactivamente usuario, nombre completo, rol (`TEACHER`, `AUXILIARY`, `ADMIN`) y contraseña con enmascaramiento en consola.
     - Contraseñas procesadas mediante PBKDF2; prohibido colocar contraseñas en código, commits o variables compartidas.
  5. **Obligatoriedad de `JWT_SECRET` fuera de desarrollo:**
     - Validación estricta en el arranque del servidor (`JwtTokenService.ValidateJwtSecret`): en entornos no-Development, la aplicación aborta inmediatamente si `JWT_SECRET` no está configurado, mide menos de 32 caracteres o coincide con valores por defecto inseguros (`secret123`, `development-secret`, `changeme`).
  6. **Resiliencia ante JWT expirado durante `POST /api/sync`:**
     - Si la tablet envía una solicitud de sincronización con un JWT expirado o inválido, el servidor responde HTTP 401 Unauthorized.
     - El cliente preserva intactos todos los registros en IndexedDB con estado `PENDING` (nunca se convierten a `ERROR` ni se eliminan).
     - La interfaz muestra una advertencia recuperable: *"Sesión expirada. Inicia sesión nuevamente para sincronizar."*
     - Al ingresar credenciales y renovar el token, el reintento sincroniza exitosamente a `SYNCED`.
  7. **Diferenciación estricta de errores de sincronización:**
     - HTTP 401: Sesión expirada -> estado `PENDING`, solicita nuevo login.
     - Errores de red / offline: estado `PENDING`, reintento automático al restablecer conexión.
     - HTTP 5xx: Fallo de servidor -> estado `PENDING`, reintento posterior.
     - Conflictos de datos/concurrencia: estado `CONFLICT`.
     - Rechazos por datos/autorización: estado `ERROR`.
  8. **Protección contra ataques de fuerza bruta en login:**
     - Implementado `LoginLockoutTracker`: tras 5 intentos fallidos consecutivos para un usuario, la cuenta entra en bloqueo temporal durante 5 minutos (HTTP 429 Too Many Requests). Un login exitoso restablece el contador.
  9. **Estado de las preguntas de Fase 0:**
     - Las preguntas sobre jornada vs. hora, celdas vacías en Excel y requerimientos específicos del auxiliar a las 9:00 AM se mantienen formalmente como **PROVISIONALES** hasta recibir confirmación explícita del docente.
  10. **Aislamiento absoluto de PILOT:**
      - Creado `docker-compose.pilot.yml` con volumen dedicado `asistencia_pgdata_pilot`, base `asistencia_pilot`, puertos diferenciados (5433/5081), `SEED_DEMO=false` y `ASPNETCORE_ENVIRONMENT=Production`.
      - Documentada la prohibición terminante de ejecutar `docker compose down -v` sobre PILOT.
  11. **Scripts reproducibles de backup y restauración:**
      - `scripts/backup-pilot.sh`: ejecuta `pg_dump -Fc`, genera archivo con timestamp en `backups/` y valida existencia y tamaño > 0 bytes.
      - `scripts/restore-test.sh`: ejecuta `pg_restore` sobre base temporal de prueba y verifica integridad de tablas y cursores. Probado exitosamente.
  12. **Bloqueo de importación real de 91 alumnos:**
      - La importación real de padrón permanece bloqueada hasta completar los prerrequisitos institucionales y de infraestructura.
