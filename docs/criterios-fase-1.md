# Criterios de Aceptación — Fase 1 (Completada)

Fecha de verificación: 2026-10-05

| Criterio / Entregable | Estado | Verificación |
|---|---|---|
| Repositorio con `docs/plan-v3.2.md`, `docs/decisiones.md`, `docs/flujo-actual.md` | Cumplido | Presentes en `docs/` |
| ASP.NET Core Web API (`Asistencia.Api`) en .NET 10 | Cumplido | Proyecto compilado y containerizado |
| Tests xUnit (`Asistencia.Tests`) | Cumplido | 14/14 tests pasando (100% exitosos) |
| PostgreSQL en `docker-compose.yml` con volumen persistente (`pgdata`) | Cumplido | Servicio `db` (Postgres 17-alpine) |
| EF Core + Npgsql configurados con nombres snake_case | Cumplido | Migración inicial generada y aplicada |
| Entidades de la sección 5 + enmiendas (DEC-003) | Cumplido | Definidas y validadas con tests |
| Tabla `sync_cursor` (1 fila: id=1, value>=0) | Cumplido | Validado por restricción CHECK y test |
| Tabla `change_log` con `server_change_id` asignado por transacción | Cumplido | Probado orden y serialización concurrente |
| Restricción única `(session_id, student_id)` en `attendance_records` | Cumplido | Probado en `SchemaConstraintTests` contra PostgreSQL |
| Restricción única `(section_id, date, slot)` en `class_sessions` | Cumplido | Probado en `SchemaConstraintTests` contra PostgreSQL |
| Datos semilla: 1 institución, 1 docente, 1 sección, 30 alumnos | Cumplido | Registrados en `change_log` (cursor = 63) |
| `docker compose up` deja funcionando PostgreSQL, API, migraciones y seed | Cumplido | API responde 200 en `/api/health` |
