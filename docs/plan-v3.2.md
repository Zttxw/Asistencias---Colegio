# Plan definitivo: Sistema de asistencia escolar offline-first (v3.2)

> Documento maestro para tres roles: (1) agente planificador, (2) agente revisor, (3) agente programador.
> Es autocontenido. Las enmiendas adoptadas tras la revisión están en [`decisiones.md`](decisiones.md).

## 0. Instrucciones por rol

- **Revisor:** valida coherencia, riesgos y omisiones. Marca cada observación como Bloqueante, Importante o Menor. No reabras decisiones de la sección 3 salvo defecto técnico concreto; en ese caso propón alternativa y su costo.
- **Programador:** implementa por fases, en orden. No avances sin cumplir los criterios de aceptación de la fase actual. No construyas nada de la sección 12. Si algo es ambiguo, elige la opción más simple, anótala en `docs/decisiones.md` y continúa. Lo marcado **[PROVISIONAL]** depende del Excel real del docente: impleméntalo fácil de cambiar.

## 1. Contexto y objetivo

- Usuario real del piloto: docente en una escuela de Chumbivilcas (Cusco, Perú), con Internet intermitente. Hoy lleva la asistencia en Excel.
- Desarrollador: vive en Cusco, PC 24/7, Docker, Linux, Tailscale.
- Objetivo del piloto (este año académico): demostrar que el docente puede pasar lista desde su tablet sin Internet y que los datos llegan íntegros al servidor al reconectar.
- Objetivo posterior (2027): con evidencia medida, proponer el sistema a la institución completa.
- Pregunta que valida el proyecto: **¿Puede pasar lista sin Internet y llegar los datos correctamente cuando vuelva la conexión?**

## 2. Principios de diseño

1. Offline-first es el requisito central.
2. El servidor es la autoridad. Nunca se usa el reloj de la tablet para decidir qué dato es más nuevo.
3. Arquitectura preparada para crecer ≠ construir todo ya. Modelo multi-docente y multi-sesión; el piloto usa 1 docente.
4. Validar primero lo más riesgoso (offline + sincronización) con un vertical slice mínimo.
5. Datos mínimos de menores: nombre, código interno, grado/sección. Sin DNI, dirección, datos médicos ni familiares.
6. El Excel sigue siendo respaldo durante todo el piloto.
7. Simplicidad: sin microservicios, sin Clean Architecture completa, sin dependencias innecesarias.

## 3. Decisiones cerradas

| # | Decisión |
|---|---|
| D1 | Stack: React + TypeScript + Vite (PWA) / ASP.NET Core Web API / EF Core (Npgsql) / PostgreSQL / Docker Compose |
| D2 | Almacenamiento local en la tablet: IndexedDB mediante Dexie.js |
| D3 | PWA con vite-plugin-pwa (Workbox) |
| D4 | IDs generados en la tablet (UUID v4). El servidor no autogenera IDs de asistencia |
| D5 | Asistencia por sesión (class_sessions). Una lista por día = una sesión «JORNADA» por día |
| D6 | Sincronización explícita: `POST /sync` (subida) y `GET /sync/changes?cursor=N` (bajada) |
| D7 | Conflictos por `version` numérica, no por fechas. `client_updated_at` solo informativo |
| D8 | Cursor de bajada: contador transaccional (`sync_cursor`) asignado dentro de la transacción del cambio, con orden garantizado de commit. Sin timestamps |
| D9 | «Todos presentes» crea registros explícitos PRESENT para cada alumno + `class_sessions.status = TAKEN` |
| D10 | Sin borrado físico: `is_void` + `voided_at` + `voided_by` |
| D11 | Infra del piloto: PC en Cusco con Docker + Tailscale HTTPS (`tailscale serve`, dominio .ts.net) |
| D12 | HTTPS terminado fuera de Kestrel. Kestrel escucha HTTP dentro de Docker |
| D13 | Producción institucional (2027): VPS, dominio, Cloudflare, backups, monitoreo. No ahora |

## 4. Arquitectura

```
Tablet (Chumbivilcas)
  React + TS PWA  <->  IndexedDB (Dexie)
        |
   ¿Hay Internet?
   NO: guarda local, estado PENDING
   SÍ: POST /sync  ->  ASP.NET Core API  ->  EF Core  ->  PostgreSQL
        |
  Tailscale + HTTPS
        |
PC en Cusco (Docker Compose: frontend, backend, postgres)
```

Tras la Fase 4 y una primera carga con conexión, el Service Worker permite abrir la app sin señal. La primera carga, el login y cada sincronización requieren conexión y Tailscale activo.

## 5. Modelo de datos (provisional)

Todas las tablas llevan `created_at` y `updated_at` del servidor. PKs `uuid` salvo indicación.

| Tabla | Campos clave | Notas |
|---|---|---|
| institutions | id, name | 1 registro en el piloto |
| users | id, institution_id, username, password_hash, role (TEACHER/AUXILIARY/ADMIN) | Auth simple + JWT |
| teachers | id, user_id, full_name | |
| academic_years | id, year, start_date, end_date | |
| sections | id, institution_id, academic_year_id, grade, name | [PROVISIONAL] |
| students | id, institution_id, code, full_name | Sin DNI. code único por institución |
| enrollments | id, student_id, section_id, academic_year_id | Único (student, academic_year) |
| class_sessions | id (UUID tablet), section_id, teacher_id, date, slot, course_name?, status (OPEN/TAKEN/VOID), version, server_change_id | Único (section_id, date, slot). slot por defecto «JORNADA» [PROVISIONAL] |
| attendance_records | id (UUID tablet), session_id, student_id, status (PRESENT/ABSENT/LATE/EXCUSED), note, version, client_updated_at, device_id, is_void, voided_at, voided_by, server_change_id | Único (session_id, student_id) |
| devices | id, user_id, name, last_sync_at | |
| non_school_days | id, institution_id, date, reason | [PROVISIONAL] |
| change_log | server_change_id (bigint PK, de sync_cursor), entity, entity_id, operation, created_at | Fuente del cursor de bajada |
| sync_cursor | id (=1), value (bigint) | Una fila. `UPDATE ... RETURNING` dentro de cada transacción de cambio |

Reglas:
- Un alumno por sesión = un registro. Corregir = actualizar (sube version).
- `server_change_id` se toma de `sync_cursor` dentro de la misma transacción que modifica el dato y crea la fila de `change_log`. El bloqueo de fila serializa escrituras hasta el COMMIT: el orden de commit coincide con el orden de IDs. No usar BIGSERIAL/SEQUENCE. En tablas de entidades `server_change_id` es informativo; la fuente oficial es `change_log`.
- Reportes y consultas excluyen `is_void = true`.
- Solo `class_sessions.status = TAKEN` indica que se pasó lista.

## 6. Protocolo de sincronización

### 6.1 Subida: `POST /sync` (autenticado)

Request:
```json
{
  "deviceId": "uuid",
  "items": [
    { "entity": "class_session | attendance_record", "id": "uuid", "baseVersion": 0, "localRev": 1,
      "clientUpdatedAt": "2026-10-05T08:03:00-05:00", "data": { } }
  ]
}
```
Response (un resultado por ítem, mismo orden):
```json
{
  "results": [
    { "id": "uuid", "status": "accepted | duplicate | conflict | rejected",
      "serverVersion": 1, "current": { }, "error": null }
  ],
  "serverCursor": 1042
}
```
Reglas de procesamiento por ítem (dentro de una transacción atómica por lote):

1. **¿Datos lógicos idénticos al servidor? (Idempotencia)**
   - **SÍ → Regla 1 (`duplicate`):** responde `duplicate` sin modificar el registro, versión ni `change_log`.
   - **NO (datos distintos) ↓**

2. **¿Es el MISMO dispositivo (`deviceId == existing.DeviceId`)?**
   - **SÍ:**
     - Si `localRev > existing.LastDeviceRev`: **Regla 2 (`accepted`)** → edición válida o continuación de cadena tras ACK perdido. Aplica cambios, `version += 1`, `last_device_rev = localRev`, registra en `change_log`.
     - Si `localRev <= existing.LastDeviceRev`: **Regla 3 (`conflict` con `current`)** → paquete rezagado o reinicio de contador (servidor intacto, no `duplicate`).
     - *Regla cardinal:* **Para el mismo dispositivo, `baseVersion` NO participa en la decisión.** Ni siquiera un `baseVersion == version` puede rescatar un paquete desfasado o con contador reiniciado.
   - **NO (otro dispositivo):**
     - Si `baseVersion == existing.Version`: **Regla 4a (`accepted`)** → edición concurrente válida de un dispositivo al día. Aplica cambios, `version += 1`, `deviceId = request.DeviceId`, `last_device_rev = localRev > 0 ? localRev : 1`, registra en `change_log`.
     - Si `baseVersion < existing.Version`: **Regla 4b (`conflict` con `current`)** → dispositivo ajeno desactualizado. Nunca sobrescribe.

3. **Inserción nueva (el ID no existe previamente):**
   - Si colisiona con el índice único de sesión (`section_id`, `date`, `slot`) o asistencia (`session_id`, `student_id`) → `conflict` con el registro canónico existente (la tablet adopta el ID canónico y reasigna).
   - Si no colisiona → se inserta con `version = 1`, `last_device_rev = localRev > 0 ? localRev : 1`, `change_log` → `accepted`.

4. **Regla 5 — Datos inválidos (`rejected`):**
   - JSON corrupto, enumeraciones no válidas, o claves foráneas inexistentes (ej. alumno o sesión no encontrada) → responde `rejected` con mensaje explicativo. No aborta los demás ítems del lote.

Orden de procesamiento: sesión antes que sus asistencias asociadas. Un fallo en un ítem no aborta el lote.

### 6.2 Bajada: `GET /sync/changes?cursor=N`

Cambios con server_change_id > N leídos de change_log, entregando el estado actual de cada entidad (deduplicada), paginado. nextCursor solo avanza hasta el máximo server_change_id incluido en la consulta.

### 6.3 Comportamiento en la tablet

- Toda escritura va primero a IndexedDB con `syncState = PENDING`.
- SYNCED solo para accepted o duplicate. conflict → CONFLICT (UI para decidir). rejected → ERROR.
- Reintentos con espera creciente; al reabrir retoma sin duplicar.
- Indicador: 🟡 «N pendientes» / 🟢 «Sincronizado» / 🔴 «Error» + Reintentar.

## 7. Autenticación

- Usuarios propios + JWT + refresh token (obligatorio en Fase 4). Fase 2: login + access token.
- Token vencido sin señal: la tablet sigue registrando; al reconectar renueva y sincroniza. Nunca se borran datos locales por expiración.
- Hash seguro de contraseñas. Roles TEACHER, AUXILIARY, ADMIN. CORS restringido.

## 8. Frontend (MVP)

1. Login. 2. Mis secciones → sección y fecha. 3. Pasar lista («Todos presentes» + excepciones + «Guardar asistencia», con corrección). 4. Historial del alumno. 5. Reporte de faltas. 6. Exportar a Excel. 7. Indicador global de sync. UI para tablet, botones grandes.

## 9. Infraestructura del piloto

- docker-compose con postgres, api, web; volumen persistente.
- Tailscale en PC y tablet; `tailscale serve` para HTTPS. Alternativa: Cloudflare Tunnel.
- Backups: pg_dump diario, copia externa, prueba de restauración documentada.
- Secretos por variables de entorno.

## 10. Fases

- **Fase 0 — Descubrimiento:** Excel real, observación, autorización (Ley 29733), métricas → `docs/flujo-actual.md`.
- **Fase 1 — Modelo de datos:** repo + docs, Asistencia.Api, Asistencia.Tests (xUnit), PostgreSQL en compose, EF Core + Npgsql, entidades, DbContext, migración inicial, sync_cursor, change_log, índices, seed (1 institución, 1 docente, 1 sección, ~30 alumnos), tests. **Aceptación:** `docker compose up` deja funcionando todo y una prueba demuestra que la BD rechaza un segundo attendance_record (sesión, alumno) y una segunda class_session (sección, fecha, slot).
- **Fase 2 — Vertical slice de sync:** una pantalla, una falta, React → Dexie → POST /sync → PostgreSQL. 9 criterios (modo avión, reenvío, reloj incorrecto, cierre a mitad, servidor caído, conflicto, concurrencia, sesión duplicada, tablet real por Tailscale).
- **Fase 3 — MVP:** login, importación Excel, pasar lista, corrección, historial, reporte, exportación. 30 alumnos < 1 min.
- **Fase 4 — PWA completa:** SW, manifest, bajada por cursor, conflictos en UI, refresh token.
- **Fase 5 — Infraestructura:** compose completo, Tailscale HTTPS, backups con restauración.
- **Fase 6 — Piloto real.** **Fase 7 — Medición.** **Fase 8 — Propuesta institucional (2027).**

## 11. Estructura del repositorio

```
asistencia/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Asistencia.Api/
│   └── Asistencia.Tests/
├── frontend/
└── docs/
    ├── plan-v3.2.md
    ├── decisiones.md
    └── flujo-actual.md
```

## 12. Fuera de alcance

QR, IA, reconocimiento facial, WhatsApp, estadísticas complejas, PDF, notificaciones, microservicios, app nativa, SaaS multiinstitución, facturación, administración completa de múltiples docentes, auditoría avanzada.

## 13. Riesgos

Sync con errores · Tailscale incómodo · Pérdida de datos · Excel distinto a lo supuesto · Datos de menores · PC apagada · Token vencido sin señal · Curva del stack.

## 14. Preguntas abiertas

1. Estructura del Excel. 2. ¿Lista por día o por hora/curso? 3. Versiones .NET/Node (resuelta: ver decisiones). 4. ¿Auxiliar con cuenta de solo lectura? 5. ¿Exportación sin conexión? (propuesta: generar en cliente). 6. Autorización de la dirección.
