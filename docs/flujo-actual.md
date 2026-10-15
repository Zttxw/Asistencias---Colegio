# Flujo actual (resultado de la Fase 0)

> **Estado: EN VALIDACIÓN OPERATIVA (Fase 0 abierta).** Se ha inspeccionado la estructura técnica del archivo Excel oficial (`LISTA OFICIAL ESTUDIANTES MATRICULADOS 2026 - copia.xlsx`) y verificado mediante Dry-Run en memoria (91 alumnos, 5 secciones). Restan 3 confirmaciones de negocio de la dinámica real del docente antes de dar por cerrada la Fase 0.

---

## 1. Preguntas clave y estado actual (Fase 0)

| Aspecto | Estado técnico y operacional | Pendiente de confirmar con el docente |
|---|---|---|
| **Estructura del padrón** | 5 secciones detectadas: 1°A (23), 4°A (19), 5°A (20), 5°B (20), 5°C (9) = **91 alumnos**. Filas amarillas en 1°A confirmadas como válidas. | ¿Existen altas/bajas de matrícula en trámite durante este mes? |
| **Identidad del alumno** | **No se utiliza número de orden** como código permanente (evita desfasajes si un alumno se retira). Se genera código persistente e inmutable: `STU-{SHA256(nombre)[0..7]}` (DEC-016). Homónimos se alertan como `⚠ POSIBLE HOMÓNIMO`. | Ninguno técnico; validado en dry-run. |
| **Jornada vs. Curso/Hora** | En el Excel el registro mensual es una columna por día calendario por sección. Apunta a `slot = JORNADA`. | **Pregunta 1:** ¿Pasa lista una sola vez por cada sección durante la mañana (jornada diaria general), o toma lista por cada hora/bloque de curso dictado? |
| **Celdas vacías en registro** | Diferenciación arquitectónica clara: si no se tomó lista, `class_session = OPEN` (no computa asistencia). Si se tomó lista, `class_session = TAKEN` (se computan P, F, T, J). | **Pregunta 2:** En el Excel físico/digital actual, ¿una celda vacía significa "no hubo clase ese día / no se llamó asistencia" o se interpreta como inasistencia por omisión? |
| **Reporte de las 9:00 AM para Auxiliaría** | **Piloto 2026:** El sistema produce el reporte diario de ausencias de las **5 secciones del docente piloto (91 alumnos)**. <br>**Propuesta 2027:** Cuando todos los docentes usen la app, el servidor consolidará las ausencias de todo el colegio. | **Pregunta 3:** Para el auxiliar a las 9:00 AM en el piloto, ¿qué información exacta necesita ver (lista de inasistencias por sección, teléfonos de apoderados en papel, o formato de parte diario)? |
| **Estados de asistencia** | 4 estados oficiales: **Presente (P)**, **Falta (F)**, **Tardanza (T)** y **Justificada (J)**. | Confirmado. |

---

## 2. Flujo operativo diario (Piloto 2026 vs. Visión 2027)

```
PILOTO 2026 (Alcance Real):
  Docente Piloto
        │
        ▼ (Toma lista en aula 08:00 - 08:30)
   5 Secciones (91 alumnos)
        │
        ▼ (Sincronización online/offline)
   Servidor Central
        │
        ▼ (09:00 AM)
   Reporte diario de ausencias del docente piloto para Auxiliaría

PROPUESTA 2027 (Visión a Escala):
  Docente A ──┐
  Docente B ──┤
  Docente C ──┼──► Servidor ──► Reporte integral de TODO el colegio (Auxiliaría/Dirección)
  Docente D ──┘
```

1. **08:00 AM – 08:30 AM (Toma de asistencia en aula):**
   - El docente abre la app en la tablet en el aula. Si no hay señal, opera offline en IndexedDB.
   - Marca asistencia en su sección con los 4 estados canónicos (`Present`, `Absent`, `Late`, `Excused`).
2. **08:45 AM – 09:00 AM (Sincronización al captar conexión):**
   - La app sincroniza vía `POST /sync` respetando `localRev` y reglas deterministas de idempotencia.
3. **09:00 AM (Parte de inasistencias para Auxiliaría):**
   - En el Piloto 2026, el Auxiliar consulta el consolidado de las 5 secciones del docente.
4. **Fin de Mes / Bimestre:**
   - Exportación de registro auxiliar mensual respetando sesiones abiertas vs. sesiones tomadas.

