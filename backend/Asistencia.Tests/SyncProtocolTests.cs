using System.Text.Json;
using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Asistencia.Api.Sync;
using Asistencia.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Tests;

public sealed class SyncProtocolTests(PostgresFixture fx) : IClassFixture<PostgresFixture>
{
    private static readonly DateOnly Day = new(2026, 10, 5);
    private static readonly Guid Dev1 = Guid.NewGuid();
    private static readonly Guid Dev2 = Guid.NewGuid();

    private static SyncProcessor NewProcessor(AppDbContext db) => new(db, new ChangeLogWriter(db));
    private static SyncQueryService NewQueryService(AppDbContext db) => new(db);

    [Fact]
    public async Task Push_NonExistent_InsertsWithVersion1_ReturnsAccepted()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var sessionItem = new SyncPushItem
        {
            Entity = EntityNames.ClassSession,
            Id = sessionId,
            BaseVersion = 0,
            Data = JsonSerializer.SerializeToElement(new
            {
                sectionId = data.SectionId,
                teacherId = data.TeacherId,
                date = Day,
                slot = ClassSession.DefaultSlot,
                status = "TAKEN"
            })
        };

        var attId = Guid.NewGuid();
        var attItem = new SyncPushItem
        {
            Entity = EntityNames.AttendanceRecord,
            Id = attId,
            BaseVersion = 0,
            Data = JsonSerializer.SerializeToElement(new
            {
                sessionId = sessionId,
                studentId = data.StudentAId,
                status = "ABSENT",
                note = "Gripe"
            })
        };

        var resp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items = [sessionItem, attItem]
        }, data.UserId);

        Assert.Equal(2, resp.Results.Count);
        Assert.All(resp.Results, r => Assert.Equal(SyncItemStatus.Accepted, r.Status));
        Assert.All(resp.Results, r => Assert.Equal(1, r.ServerVersion));

        // Verificamos persistencia
        var session = await db.ClassSessions.FindAsync(sessionId);
        Assert.NotNull(session);
        Assert.Equal(1, session.Version);

        var att = await db.AttendanceRecords.FindAsync(attId);
        Assert.NotNull(att);
        Assert.Equal(1, att.Version);
        Assert.Equal(AttendanceStatus.Absent, att.Status);
    }

    [Fact]
    public async Task Push_ResendExactSameBatch_ReturnsDuplicate_NoChanges()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();
        var req = new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = sessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        sectionId = data.SectionId,
                        teacherId = data.TeacherId,
                        date = Day,
                        slot = "HORA-1",
                        status = "TAKEN"
                    })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        sessionId = sessionId,
                        studentId = data.StudentAId,
                        status = "PRESENT"
                    })
                }
            ]
        };

        // Primer envío -> Accepted
        var resp1 = await proc.ProcessPushAsync(req, data.UserId);
        Assert.All(resp1.Results, r => Assert.Equal(SyncItemStatus.Accepted, r.Status));
        var cursor1 = resp1.ServerCursor;

        // Segundo envío con mismo lote (e incluso diferente clientUpdatedAt) -> Duplicate
        req.Items[0].ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(5);
        var resp2 = await proc.ProcessPushAsync(req, data.UserId);

        Assert.All(resp2.Results, r => Assert.Equal(SyncItemStatus.Duplicate, r.Status));
        Assert.Equal(1, resp2.Results[0].ServerVersion);
        Assert.Equal(1, resp2.Results[1].ServerVersion);
        Assert.Equal(cursor1, resp2.ServerCursor); // No aumentó el cursor
    }

    [Fact]
    public async Task Push_ExistingWithMatchingBaseVersion_AppliesAndIncrementsVersion()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();

        // 1. Crear registro v1
        await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = sessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(1), slot = "JORNADA", status = "TAKEN" })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "ABSENT" })
                }
            ]
        }, data.UserId);

        // 2. Modificar con baseVersion = 1 -> Acepta v2
        var updateResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 1,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "LATE", note = "Llegó 15 min tarde" })
                }
            ]
        }, data.UserId);

        Assert.Single(updateResp.Results);
        Assert.Equal(SyncItemStatus.Accepted, updateResp.Results[0].Status);
        Assert.Equal(2, updateResp.Results[0].ServerVersion);

        var updated = await db.AttendanceRecords.FindAsync(attId);
        Assert.NotNull(updated);
        Assert.Equal(2, updated.Version);
        Assert.Equal(AttendanceStatus.Late, updated.Status);
    }

    [Fact]
    public async Task Push_ExistingWithOutdatedBaseVersion_ReturnsConflictWithCurrent()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();

        // Creamos v1
        await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = sessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(2), slot = "JORNADA", status = "TAKEN" })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "ABSENT" })
                }
            ]
        }, data.UserId);

        // Dev2 avanza el registro a v2
        await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev2,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 1,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "PRESENT" })
                }
            ]
        }, data.UserId);

        // Ahora Dev1 intenta enviar con baseVersion = 1 un dato distinto (LATE) cuando el server ya está en v2 -> CONFLICT
        var conflictResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 1,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "LATE" })
                }
            ]
        }, data.UserId);

        Assert.Single(conflictResp.Results);
        Assert.Equal(SyncItemStatus.Conflict, conflictResp.Results[0].Status);
        Assert.Equal(2, conflictResp.Results[0].ServerVersion);
        Assert.NotNull(conflictResp.Results[0].Current);

        // La BD mantiene el valor v2 (PRESENT)
        var record = await db.AttendanceRecords.FindAsync(attId);
        Assert.Equal(AttendanceStatus.Present, record!.Status);
    }

    [Fact]
    public async Task Push_DuplicateSessionSlot_ReturnsConflictWithCanonicalSessionId()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var firstSessionId = Guid.NewGuid();
        // 1. Tablet A crea la sesión de la mañana
        await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = firstSessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(3), slot = "JORNADA", status = "TAKEN" })
                }
            ]
        }, data.UserId);

        // 2. Tablet reinstalada crea OTRA sesión con otro UUID para la misma sección, fecha y slot
        var secondSessionId = Guid.NewGuid();
        var resp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev2,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = secondSessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(3), slot = "JORNADA", status = "TAKEN" })
                }
            ]
        }, data.UserId);

        Assert.Single(resp.Results);
        Assert.Equal(SyncItemStatus.Conflict, resp.Results[0].Status);
        Assert.NotNull(resp.Results[0].Current);
        // El current contiene el canonical id de firstSessionId
        var json = JsonSerializer.Serialize(resp.Results[0].Current);
        Assert.Contains(firstSessionId.ToString(), json);
    }

    [Fact]
    public async Task Push_LostAckChainContinuation_AcceptsWithoutFalseConflict()
    {
        // Revisión I1 / DEC-003: Lost ack + edición local del mismo dispositivo
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();

        // Envío inicial (base 0) aceptado por el server como v1 (pero supongamos que el ACK se perdió en red)
        await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = sessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(4), slot = "JORNADA", status = "TAKEN" })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "ABSENT" })
                }
            ]
        }, data.UserId);

        // El docente en esa misma tablet corrige a LATE antes de enterarse que fue aceptado (aún tiene baseVersion 0)
        var resendResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0, // Misma tablet, continuación de cadena
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "LATE" })
                }
            ]
        }, data.UserId);

        Assert.Single(resendResp.Results);
        // Debe ser accepted con version 2, NO conflicto falso contra uno mismo
        Assert.Equal(SyncItemStatus.Accepted, resendResp.Results[0].Status);
        Assert.Equal(2, resendResp.Results[0].ServerVersion);

        var finalRecord = await db.AttendanceRecords.FindAsync(attId);
        Assert.Equal(AttendanceStatus.Late, finalRecord!.Status);
    }

    [Fact]
    public async Task Push_InvalidData_ReturnsRejected_DoesNotAbortOtherItems()
    {
        // F2-12: Fallo parcial
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var validSessionId = Guid.NewGuid();
        var badSessionId = Guid.NewGuid();

        var resp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = validSessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(5), slot = "JORNADA", status = "TAKEN" })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = badSessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = Guid.NewGuid(), teacherId = data.TeacherId, date = Day.AddDays(5), slot = "JORNADA", status = "TAKEN" }) // Sección inexistente
                }
            ]
        }, data.UserId);

        Assert.Equal(2, resp.Results.Count);
        Assert.Equal(SyncItemStatus.Accepted, resp.Results[0].Status);
        Assert.Equal(SyncItemStatus.Rejected, resp.Results[1].Status);

        // El válido se guardó
        Assert.NotNull(await db.ClassSessions.FindAsync(validSessionId));
        // El inválido no existe
        Assert.Null(await db.ClassSessions.FindAsync(badSessionId));
    }

    [Fact]
    public async Task GetChanges_ReturnsIncrementalEntities_AndDoesNotSkipCursor()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);
        var query = NewQueryService(db);

        // Estado inicial de cursor
        var init = await query.GetChangesAsync(0);
        var startCursor = init.NextCursor;

        // Crear una sesión y asistencia
        var sessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();
        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = sessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(6), slot = "JORNADA", status = "TAKEN" })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "PRESENT" })
                }
            ]
        }, data.UserId);

        // Consulta de cambios desde startCursor
        var changesResp = await query.GetChangesAsync(startCursor);
        Assert.Equal(2, changesResp.Changes.Count);
        Assert.Equal(pushResp.ServerCursor, changesResp.NextCursor);
        Assert.Contains(changesResp.Changes, c => c.Entity == EntityNames.ClassSession && c.EntityId == sessionId);
        Assert.Contains(changesResp.Changes, c => c.Entity == EntityNames.AttendanceRecord && c.EntityId == attId);

        // Si consultamos de nuevo con el nextCursor, ya no hay cambios nuevos
        var noMore = await query.GetChangesAsync(changesResp.NextCursor);
        Assert.Empty(noMore.Changes);
        Assert.Equal(changesResp.NextCursor, noMore.NextCursor);
    }
}
