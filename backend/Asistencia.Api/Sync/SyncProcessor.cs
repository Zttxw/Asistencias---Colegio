using System.Text.Json;
using System.Text.Json.Serialization;
using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Asistencia.Api.Sync;

public sealed class ClassSessionDataDto
{
    [JsonPropertyName("sectionId")]
    public Guid SectionId { get; set; }

    [JsonPropertyName("teacherId")]
    public Guid TeacherId { get; set; }

    [JsonPropertyName("date")]
    public DateOnly Date { get; set; }

    [JsonPropertyName("slot")]
    public string Slot { get; set; } = ClassSession.DefaultSlot;

    [JsonPropertyName("courseName")]
    public string? CourseName { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "OPEN";

    [JsonPropertyName("isVoid")]
    public bool? IsVoid { get; set; }
}

public sealed class AttendanceRecordDataDto
{
    [JsonPropertyName("sessionId")]
    public Guid SessionId { get; set; }

    [JsonPropertyName("studentId")]
    public Guid StudentId { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "PRESENT";

    [JsonPropertyName("note")]
    public string? Note { get; set; }

    [JsonPropertyName("isVoid")]
    public bool IsVoid { get; set; }
}

public sealed class SyncProcessor(AppDbContext db, ChangeLogWriter changes)
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<SyncPushResponse> ProcessPushAsync(SyncPushRequest request, Guid currentUserId, CancellationToken ct = default)
    {
        // 1. Validar usuario y rol (Requisitos 2 y 3)
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == currentUserId, ct);
        if (user != null && user.Role == UserRole.Auxiliary)
        {
            // El rol AUXILIARY es de solo lectura; no puede hacer POST /api/sync
            return new SyncPushResponse
            {
                Results = request.Items.Select(item => new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Rejected,
                    Error = "No autorizado: El rol AUXILIARY no tiene permisos de escritura en sincronización."
                }).ToList(),
                ServerCursor = await GetCurrentCursorAsync(ct),
                ServerTime = DateTimeOffset.UtcNow
            };
        }

        // Obtener ID de docente y secciones asignadas si el usuario es docente
        Guid? authenticatedTeacherId = null;
        List<Guid>? assignedSectionIds = null;
        if (user == null || user.Role == UserRole.Teacher)
        {
            var teacher = await db.Teachers.AsNoTracking().FirstOrDefaultAsync(t => t.UserId == currentUserId, ct);
            if (teacher != null)
            {
                authenticatedTeacherId = teacher.Id;
                assignedSectionIds = await db.SectionTeachers.AsNoTracking()
                    .Where(st => st.TeacherId == teacher.Id)
                    .Select(st => st.SectionId)
                    .ToListAsync(ct);
            }
            else
            {
                assignedSectionIds = [];
            }
        }

        // Asegurar que el dispositivo existe y está asociado al usuario (revisión M4)
        await EnsureDeviceAsync(request.DeviceId, currentUserId, ct);

        var results = new List<SyncItemResult>();

        // Cada ítem se procesa en su propia transacción para que un error no aborte todo el lote (6.1)
        foreach (var item in request.Items)
        {
            var res = await ProcessItemWithTxAsync(item, request.DeviceId, currentUserId, authenticatedTeacherId, assignedSectionIds, ct);
            results.Add(res);
        }

        long currentCursor;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            currentCursor = await changes.LockAsync(ct);
            await tx.RollbackAsync(ct);
        }

        return new SyncPushResponse
        {
            Results = results,
            ServerCursor = currentCursor,
            ServerTime = DateTimeOffset.UtcNow
        };
    }

    private async Task<long> GetCurrentCursorAsync(CancellationToken ct)
    {
        return await db.SyncCursor.Where(c => c.Id == 1).Select(c => c.Value).FirstOrDefaultAsync(ct);
    }

    private async Task<SyncItemResult> ProcessItemWithTxAsync(SyncPushItem item, Guid deviceId, Guid currentUserId, Guid? authenticatedTeacherId, List<Guid>? assignedSectionIds, CancellationToken ct)
    {
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            // 1. Bloqueo al inicio de la transacción para evitar deadlocks y carreras de unicidad (D8, DEC-007)
            await changes.LockAsync(ct);

            SyncItemResult result;
            if (string.Equals(item.Entity, EntityNames.ClassSession, StringComparison.OrdinalIgnoreCase))
            {
                result = await ProcessClassSessionAsync(item, deviceId, currentUserId, authenticatedTeacherId, assignedSectionIds, ct);
            }
            else if (string.Equals(item.Entity, EntityNames.AttendanceRecord, StringComparison.OrdinalIgnoreCase))
            {
                result = await ProcessAttendanceRecordAsync(item, deviceId, currentUserId, assignedSectionIds, ct);
            }
            else
            {
                result = new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Rejected,
                    Error = $"Entidad desconocida o no sincronizable: '{item.Entity}'"
                };
            }

            if (result.Status == SyncItemStatus.Accepted)
            {
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
            }
            else
            {
                // Para duplicate, conflict, rejected no persistimos cambios en la BD
                await tx.RollbackAsync(ct);
            }

            return result;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Red de seguridad si chocó con un índice único concurrente
            return await HandleUniqueViolationFallbackAsync(item, ct);
        }
        catch (Exception ex)
        {
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Rejected,
                Error = ex.Message
            };
        }
    }

    private async Task<SyncItemResult> ProcessClassSessionAsync(SyncPushItem item, Guid deviceId, Guid currentUserId, Guid? authenticatedTeacherId, List<Guid>? assignedSectionIds, CancellationToken ct)
    {
        ClassSessionDataDto? data;
        try
        {
            data = JsonSerializer.Deserialize<ClassSessionDataDto>(item.Data.GetRawText(), JsonOpts);
            if (data is null) throw new InvalidOperationException("data nulo");
        }
        catch (Exception ex)
        {
            return new SyncItemResult { Id = item.Id, Status = SyncItemStatus.Rejected, Error = $"Data inválido: {ex.Message}" };
        }

        if (!Enum.TryParse<SessionStatus>(data.Status, true, out var sessionStatus))
        {
            return new SyncItemResult { Id = item.Id, Status = SyncItemStatus.Rejected, Error = $"Estado de sesión inválido: '{data.Status}'" };
        }

        // Validar autorización de sección para docentes (Requisito 2)
        if (assignedSectionIds != null && !assignedSectionIds.Contains(data.SectionId))
        {
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Rejected,
                Error = "No autorizado: El docente no tiene asignada la sección correspondiente a esta sesión de clase."
            };
        }

        // Validar que el docente no falsee teacher_id (Punto 3)
        if (authenticatedTeacherId.HasValue && data.TeacherId != Guid.Empty && data.TeacherId != authenticatedTeacherId.Value)
        {
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Rejected,
                Error = "No autorizado: No se permite registrar una sesión asignada a otro docente."
            };
        }

        // Validar que la sección existe
        var sectionExists = await db.Sections.AnyAsync(s => s.Id == data.SectionId, ct);
        if (!sectionExists)
        {
            return new SyncItemResult { Id = item.Id, Status = SyncItemStatus.Rejected, Error = $"Sección {data.SectionId} no existe." };
        }

        // Buscar registro por ID exacto
        var existing = await db.ClassSessions.FirstOrDefaultAsync(s => s.Id == item.Id, ct);
        if (existing is not null)
        {
            if (assignedSectionIds != null && !assignedSectionIds.Contains(existing.SectionId))
            {
                return new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Rejected,
                    Error = "No autorizado: El docente no tiene asignada la sección correspondiente a la sesión existente."
                };
            }

            if (authenticatedTeacherId.HasValue && existing.TeacherId != authenticatedTeacherId.Value)
            {
                return new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Rejected,
                    Error = "No autorizado: La sesión existente pertenece a otro docente."
                };
            }

            if (authenticatedTeacherId.HasValue && data.TeacherId != Guid.Empty && data.TeacherId != existing.TeacherId)
            {
                return new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Rejected,
                    Error = "No autorizado: No se permite cambiar el docente asignado a la sesión."
                };
            }
        }

        if (existing is null)
        {
            // Regla 1: No existe por ID. Verificar si choca con índice único (section_id, date, slot)
            var clash = await db.ClassSessions.FirstOrDefaultAsync(s =>
                s.SectionId == data.SectionId && s.Date == data.Date && s.Slot == data.Slot, ct);

            if (clash is not null)
            {
                // Conflicto de sesión: devolver el registro existente para que la tablet adopte su ID (6.1 regla 1)
                return new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Conflict,
                    ServerVersion = clash.Version,
                    Current = ToSessionDto(clash),
                    Error = "Conflicto con sesión existente en la misma sección, fecha y slot. Adopte el ID de la sesión existente."
                };
            }

            // Inserción aceptada con version = 1
            var newSession = new ClassSession
            {
                Id = item.Id,
                SectionId = data.SectionId,
                TeacherId = authenticatedTeacherId ?? (data.TeacherId != Guid.Empty ? data.TeacherId : Guid.Empty),
                Date = data.Date,
                Slot = data.Slot ?? ClassSession.DefaultSlot,
                CourseName = data.CourseName,
                Status = sessionStatus,
                Version = 1,
                DeviceId = deviceId,
                ChainBaseVersion = item.BaseVersion,
                LastDeviceRev = item.LocalRev > 0 ? item.LocalRev : 1,
                ClientUpdatedAt = item.ClientUpdatedAt
            };

            db.ClassSessions.Add(newSession);
            newSession.ServerChangeId = await changes.RecordAsync(EntityNames.ClassSession, newSession.Id, ChangeOperation.Insert, ct: ct);

            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Accepted,
                ServerVersion = 1
            };
        }

        // El registro existe por ID
        // Regla 2: ¿Datos idénticos? (ignora clientUpdatedAt y baseVersion)
        if (IsSessionDataEqual(existing, data, sessionStatus))
        {
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Duplicate,
                ServerVersion = existing.Version
            };
        }

        var isSameDevice = existing.DeviceId == deviceId;

        if (isSameDevice)
        {
            // Para el mismo dispositivo, baseVersion ya no participa en la decisión:
            // Toda progresión depende estrictamente del contador localRev > lastDeviceRev.
            if (item.LocalRev > existing.LastDeviceRev)
            {
                existing.Status = sessionStatus;
                existing.CourseName = data.CourseName;
                existing.Version += 1;
                existing.LastDeviceRev = item.LocalRev;
                existing.ClientUpdatedAt = item.ClientUpdatedAt;

                existing.ServerChangeId = await changes.RecordAsync(EntityNames.ClassSession, existing.Id, ChangeOperation.Update, ct: ct);

                return new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Accepted,
                    ServerVersion = existing.Version
                };
            }

            // Mismo dispositivo con localRev <= lastDeviceRev y datos distintos:
            // Paquete rezagado o reinicio de contador (baseVersion == version nunca rescata este caso).
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Conflict,
                ServerVersion = existing.Version,
                Current = ToSessionDto(existing),
                Error = $"Conflicto de secuencia del mismo dispositivo: localRev={item.LocalRev} <= lastDeviceRev={existing.LastDeviceRev} con datos distintos."
            };
        }

        // Otro dispositivo: decide según baseVersion frente a la versión actual del servidor
        if (item.BaseVersion == existing.Version)
        {
            existing.Status = sessionStatus;
            existing.CourseName = data.CourseName;
            existing.Version += 1;
            existing.DeviceId = deviceId;
            existing.LastDeviceRev = item.LocalRev > 0 ? item.LocalRev : 1;
            existing.ClientUpdatedAt = item.ClientUpdatedAt;

            existing.ServerChangeId = await changes.RecordAsync(EntityNames.ClassSession, existing.Id, ChangeOperation.Update, ct: ct);

            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Accepted,
                ServerVersion = existing.Version
            };
        }

        // Otro dispositivo con versión obsoleta (baseVersion < existing.Version)
        return new SyncItemResult
        {
            Id = item.Id,
            Status = SyncItemStatus.Conflict,
            ServerVersion = existing.Version,
            Current = ToSessionDto(existing),
            Error = $"Versión obsoleta de otro dispositivo. Servidor={existing.Version}, Cliente={item.BaseVersion}."
        };
    }

    private async Task<SyncItemResult> ProcessAttendanceRecordAsync(SyncPushItem item, Guid deviceId, Guid currentUserId, List<Guid>? assignedSectionIds, CancellationToken ct)
    {
        AttendanceRecordDataDto? data;
        try
        {
            data = JsonSerializer.Deserialize<AttendanceRecordDataDto>(item.Data.GetRawText(), JsonOpts);
            if (data is null) throw new InvalidOperationException("data nulo");
        }
        catch (Exception ex)
        {
            return new SyncItemResult { Id = item.Id, Status = SyncItemStatus.Rejected, Error = $"Data inválido: {ex.Message}" };
        }

        if (!Enum.TryParse<AttendanceStatus>(data.Status, true, out var attendanceStatus))
        {
            return new SyncItemResult { Id = item.Id, Status = SyncItemStatus.Rejected, Error = $"Estado de asistencia inválido: '{data.Status}'" };
        }

        // Validar que la sesión exista
        var session = await db.ClassSessions.FirstOrDefaultAsync(s => s.Id == data.SessionId, ct);
        if (session is null)
        {
            return new SyncItemResult { Id = item.Id, Status = SyncItemStatus.Rejected, Error = $"Sesión {data.SessionId} no encontrada." };
        }

        // Validar que el docente tenga asignada la sección de esta sesión (Requisito 2)
        if (assignedSectionIds != null && !assignedSectionIds.Contains(session.SectionId))
        {
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Rejected,
                Error = "No autorizado: El docente no tiene asignada la sección correspondiente a esta asistencia."
            };
        }

        // Resolver la sección de la asistencia estrictamente desde el servidor (Punto 1)
        if (item.Data.TryGetProperty("sectionId", out var payloadSecProp) &&
            payloadSecProp.TryGetGuid(out var payloadSecId) &&
            payloadSecId != session.SectionId)
        {
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Rejected,
                Error = "No autorizado: La sección enviada en el payload no coincide con la sección de la sesión en el servidor."
            };
        }

        // Validar que el alumno exista
        var studentExists = await db.Students.AnyAsync(s => s.Id == data.StudentId, ct);
        if (!studentExists)
        {
            return new SyncItemResult { Id = item.Id, Status = SyncItemStatus.Rejected, Error = $"Alumno {data.StudentId} no encontrado." };
        }

        // Validar que el alumno tenga matrícula activa en la sección de la sesión (Punto 2)
        var isEnrolled = await db.Enrollments.AnyAsync(e =>
            e.StudentId == data.StudentId &&
            e.SectionId == session.SectionId &&
            e.Status == EnrollmentStatus.Active, ct);

        if (!isEnrolled)
        {
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Rejected,
                Error = $"El alumno {data.StudentId} no tiene matrícula activa en la sección correspondiente a esta sesión."
            };
        }

        var existing = await db.AttendanceRecords.FirstOrDefaultAsync(r => r.Id == item.Id, ct);
        if (existing is not null && existing.SessionId != data.SessionId)
        {
            var existingSession = await db.ClassSessions.FirstOrDefaultAsync(s => s.Id == existing.SessionId, ct);
            if (existingSession != null && assignedSectionIds != null && !assignedSectionIds.Contains(existingSession.SectionId))
            {
                return new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Rejected,
                    Error = "No autorizado: El docente no tiene asignada la sección correspondiente al registro existente."
                };
            }
        }

        if (existing is null)
        {
            // Regla 1: No existe por ID. Verificar choque con índice único (session_id, student_id)
            var clash = await db.AttendanceRecords.FirstOrDefaultAsync(r =>
                r.SessionId == data.SessionId && r.StudentId == data.StudentId, ct);

            if (clash is not null)
            {
                // Choca con índice único
                return new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Conflict,
                    ServerVersion = clash.Version,
                    Current = ToAttendanceDto(clash),
                    Error = "Ya existe un registro de asistencia para este alumno en esta sesión."
                };
            }

            var newRecord = new AttendanceRecord
            {
                Id = item.Id,
                SessionId = data.SessionId,
                StudentId = data.StudentId,
                Status = attendanceStatus,
                Note = NormalizeNote(data.Note),
                IsVoid = data.IsVoid,
                VoidedAt = data.IsVoid ? DateTime.UtcNow : null,
                VoidedBy = data.IsVoid ? currentUserId : null,
                Version = 1,
                DeviceId = deviceId,
                ChainBaseVersion = item.BaseVersion,
                LastDeviceRev = item.LocalRev > 0 ? item.LocalRev : 1,
                ClientUpdatedAt = item.ClientUpdatedAt
            };

            db.AttendanceRecords.Add(newRecord);
            newRecord.ServerChangeId = await changes.RecordAsync(EntityNames.AttendanceRecord, newRecord.Id, ChangeOperation.Insert, ct: ct);

            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Accepted,
                ServerVersion = 1
            };
        }

        // Regla 2: ¿Datos idénticos?
        if (IsAttendanceDataEqual(existing, data, attendanceStatus))
        {
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Duplicate,
                ServerVersion = existing.Version
            };
        }

        var isSameDevice = existing.DeviceId == deviceId;

        if (isSameDevice)
        {
            // Para el mismo dispositivo, baseVersion ya no participa en la decisión:
            // Toda progresión depende estrictamente del contador localRev > lastDeviceRev.
            if (item.LocalRev > existing.LastDeviceRev)
            {
                var prevStatus = existing.Status.ToString().ToUpperInvariant();
                existing.Status = attendanceStatus;
                existing.Note = NormalizeNote(data.Note);
                if (data.IsVoid && !existing.IsVoid)
                {
                    existing.IsVoid = true;
                    existing.VoidedAt = DateTime.UtcNow;
                    existing.VoidedBy = currentUserId;
                }
                else if (!data.IsVoid && existing.IsVoid)
                {
                    existing.IsVoid = false;
                    existing.VoidedAt = null;
                    existing.VoidedBy = null;
                }

                existing.Version += 1;
                existing.LastDeviceRev = item.LocalRev;
                existing.ClientUpdatedAt = item.ClientUpdatedAt;

                existing.ServerChangeId = await changes.RecordAsync(EntityNames.AttendanceRecord, existing.Id, ChangeOperation.Update,
                    previousStatus: prevStatus, ct: ct);

                return new SyncItemResult
                {
                    Id = item.Id,
                    Status = SyncItemStatus.Accepted,
                    ServerVersion = existing.Version
                };
            }

            // Mismo dispositivo con localRev <= lastDeviceRev y datos distintos:
            // Paquete rezagado o reinicio de contador (baseVersion == version nunca rescata este caso).
            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Conflict,
                ServerVersion = existing.Version,
                Current = ToAttendanceDto(existing),
                Error = $"Conflicto de secuencia del mismo dispositivo: localRev={item.LocalRev} <= lastDeviceRev={existing.LastDeviceRev} con datos distintos."
            };
        }

        // Otro dispositivo: decide según baseVersion frente a la versión actual del servidor
        if (item.BaseVersion == existing.Version)
        {
            var prevStatus = existing.Status.ToString().ToUpperInvariant();
            existing.Status = attendanceStatus;
            existing.Note = NormalizeNote(data.Note);
            if (data.IsVoid && !existing.IsVoid)
            {
                existing.IsVoid = true;
                existing.VoidedAt = DateTime.UtcNow;
                existing.VoidedBy = currentUserId;
            }
            else if (!data.IsVoid && existing.IsVoid)
            {
                existing.IsVoid = false;
                existing.VoidedAt = null;
                existing.VoidedBy = null;
            }

            existing.Version += 1;
            existing.DeviceId = deviceId;
            existing.LastDeviceRev = item.LocalRev > 0 ? item.LocalRev : 1;
            existing.ClientUpdatedAt = item.ClientUpdatedAt;

            existing.ServerChangeId = await changes.RecordAsync(EntityNames.AttendanceRecord, existing.Id, ChangeOperation.Update,
                previousStatus: prevStatus, ct: ct);

            return new SyncItemResult
            {
                Id = item.Id,
                Status = SyncItemStatus.Accepted,
                ServerVersion = existing.Version
            };
        }

        // Otro dispositivo desactualizado (baseVersion < existing.Version)
        return new SyncItemResult
        {
            Id = item.Id,
            Status = SyncItemStatus.Conflict,
            ServerVersion = existing.Version,
            Current = ToAttendanceDto(existing),
            Error = $"Versión obsoleta de otro dispositivo. Servidor={existing.Version}, Cliente={item.BaseVersion}."
        };
    }

    private async Task<SyncItemResult> HandleUniqueViolationFallbackAsync(SyncPushItem item, CancellationToken ct)
    {
        await using var readDb = db;
        if (string.Equals(item.Entity, EntityNames.ClassSession, StringComparison.OrdinalIgnoreCase))
        {
            var data = JsonSerializer.Deserialize<ClassSessionDataDto>(item.Data.GetRawText(), JsonOpts);
            if (data != null)
            {
                var clash = await readDb.ClassSessions.AsNoTracking().FirstOrDefaultAsync(s =>
                    s.SectionId == data.SectionId && s.Date == data.Date && s.Slot == data.Slot, ct);
                if (clash != null)
                {
                    return new SyncItemResult
                    {
                        Id = item.Id,
                        Status = SyncItemStatus.Conflict,
                        ServerVersion = clash.Version,
                        Current = ToSessionDto(clash),
                        Error = "Conflicto por clave única en sesión."
                    };
                }
            }
        }
        else if (string.Equals(item.Entity, EntityNames.AttendanceRecord, StringComparison.OrdinalIgnoreCase))
        {
            var data = JsonSerializer.Deserialize<AttendanceRecordDataDto>(item.Data.GetRawText(), JsonOpts);
            if (data != null)
            {
                var clash = await readDb.AttendanceRecords.AsNoTracking().FirstOrDefaultAsync(r =>
                    r.SessionId == data.SessionId && r.StudentId == data.StudentId, ct);
                if (clash != null)
                {
                    return new SyncItemResult
                    {
                        Id = item.Id,
                        Status = SyncItemStatus.Conflict,
                        ServerVersion = clash.Version,
                        Current = ToAttendanceDto(clash),
                        Error = "Conflicto por clave única en asistencia."
                    };
                }
            }
        }

        return new SyncItemResult
        {
            Id = item.Id,
            Status = SyncItemStatus.Conflict,
            Error = "Violación de índice único."
        };
    }

    private async Task EnsureDeviceAsync(Guid deviceId, Guid currentUserId, CancellationToken ct)
    {
        var dev = await db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId, ct);
        var now = DateTime.UtcNow;
        if (dev is null)
        {
            db.Devices.Add(new Device
            {
                Id = deviceId,
                UserId = currentUserId,
                Name = "Tablet",
                LastSyncAt = now
            });
            await db.SaveChangesAsync(ct);
        }
        else
        {
            // Actualizar last_sync_at directamente con SQL para no marcar la entidad como modificada
            // en el ChangeTracker si el lote resulta ser solo duplicate o conflict
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE devices SET last_sync_at = {now}, updated_at = {now} WHERE id = {deviceId}", ct);
        }
    }

    private static bool IsSessionDataEqual(ClassSession s, ClassSessionDataDto d, SessionStatus parsedStatus) =>
        s.SectionId == d.SectionId &&
        s.Date == d.Date &&
        string.Equals(s.Slot, d.Slot ?? ClassSession.DefaultSlot, StringComparison.Ordinal) &&
        string.Equals(s.CourseName ?? "", d.CourseName ?? "", StringComparison.Ordinal) &&
        s.Status == parsedStatus;

    private static bool IsAttendanceDataEqual(AttendanceRecord r, AttendanceRecordDataDto d, AttendanceStatus parsedStatus) =>
        r.SessionId == d.SessionId &&
        r.StudentId == d.StudentId &&
        r.Status == parsedStatus &&
        string.Equals(NormalizeNote(r.Note), NormalizeNote(d.Note), StringComparison.Ordinal) &&
        r.IsVoid == d.IsVoid;

    private static string? NormalizeNote(string? note) =>
        string.IsNullOrWhiteSpace(note) ? null : note.Trim();

    private static object ToSessionDto(ClassSession s) => new
    {
        id = s.Id,
        sectionId = s.SectionId,
        teacherId = s.TeacherId,
        date = s.Date,
        slot = s.Slot,
        courseName = s.CourseName,
        status = s.Status.ToString().ToUpperInvariant(),
        version = s.Version,
        serverChangeId = s.ServerChangeId
    };

    private static object ToAttendanceDto(AttendanceRecord r) => new
    {
        id = r.Id,
        sessionId = r.SessionId,
        studentId = r.StudentId,
        status = r.Status.ToString().ToUpperInvariant(),
        note = r.Note,
        isVoid = r.IsVoid,
        version = r.Version,
        serverChangeId = r.ServerChangeId
    };
}
