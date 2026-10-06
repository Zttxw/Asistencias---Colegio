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

    [Fact]
    public async Task Push_LostAckChainContinuation_FromDifferentDevice_ReturnsConflict()
    {
        // 1.3: Device A envía versión 1 (ACK se pierde o Device B tiene baseVersion obsoleta)
        // Device B envía modificación usando baseVersion antigua -> CONFLICT (no accepted)
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();

        // Device A inserta versión 1
        var respA = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = sessionId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(7), slot = "JORNADA", status = "TAKEN" })
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

        Assert.All(respA.Results, r => Assert.Equal(SyncItemStatus.Accepted, r.Status));

        // Device B envía modificación usando baseVersion = 0 (desactualizada)
        var respB = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev2, // Diferente dispositivo!
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0, // Antigua
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "LATE" })
                }
            ]
        }, data.UserId);

        Assert.Single(respB.Results);
        Assert.Equal(SyncItemStatus.Conflict, respB.Results[0].Status);
        Assert.Equal(1, respB.Results[0].ServerVersion);

        // El registro del servidor no debe ser sobrescrito
        var unchanged = await db.AttendanceRecords.FindAsync(attId);
        Assert.Equal(AttendanceStatus.Absent, unchanged!.Status);
        Assert.Equal(1, unchanged.Version);
    }

    [Fact]
    public async Task Push_DelayedRetryWithLowerLocalRev_ReturnsDuplicate_DoesNotOverwriteNewerEdit()
    {
        // Caso de revisión: Reenvío tardío desfasado en red.
        // Tablet A aplica edición 1 (localRev = 1, status = PRESENT) -> versión 1
        // Tablet A aplica edición 2 (localRev = 2, status = LATE) -> versión 2
        // Llega tarde el paquete de la edición 1 (localRev = 1) debido a reintento en vuelo desfasado.
        // Debe responder duplicate y NUNCA pisar la edición 2 más reciente.
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();

        // 1. Crear sesión y asistencia inicial (localRev = 1)
        var push1 = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = sessionId,
                    BaseVersion = 0,
                    LocalRev = 1,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(15), slot = "JORNADA", status = "TAKEN" })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    LocalRev = 1,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "PRESENT" })
                }
            ]
        }, data.UserId);

        Assert.All(push1.Results, r => Assert.Equal(SyncItemStatus.Accepted, r.Status));
        Assert.Equal(1, push1.Results[1].ServerVersion);

        // 2. Tablet edita a LATE (localRev = 2). Supongamos que el ACK anterior se perdió o la tablet continuó su cadena (baseVersion = 0)
        var push2 = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    LocalRev = 2,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "LATE" })
                }
            ]
        }, data.UserId);

        Assert.Single(push2.Results);
        Assert.Equal(SyncItemStatus.Accepted, push2.Results[0].Status);
        Assert.Equal(2, push2.Results[0].ServerVersion);

        // El registro actual en el servidor es LATE con versión 2 y LastDeviceRev = 2
        var current = await db.AttendanceRecords.AsNoTracking().FirstAsync(r => r.Id == attId);
        Assert.Equal(AttendanceStatus.Late, current.Status);
        Assert.Equal(2, current.Version);
        Assert.Equal(2, current.LastDeviceRev);

        var cursorBeforeDelayed = (await db.SyncCursor.FindAsync(1))!.Value;

        // 3. Llega tarde el paquete de la edición 1 (localRev = 1, status = PRESENT)
        var pushDelayed = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    LocalRev = 1, // Menor que LastDeviceRev (2)
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "PRESENT" })
                }
            ]
        }, data.UserId);

        // Debe responder duplicate
        Assert.Single(pushDelayed.Results);
        Assert.Equal(SyncItemStatus.Duplicate, pushDelayed.Results[0].Status);
        Assert.Equal(2, pushDelayed.Results[0].ServerVersion);

        // Verificar que en la base de datos sigue siendo LATE y no se modificó la versión ni se incrementó el cursor de change_log
        var afterDelayed = await db.AttendanceRecords.AsNoTracking().FirstAsync(r => r.Id == attId);
        Assert.Equal(AttendanceStatus.Late, afterDelayed.Status);
        Assert.Equal(2, afterDelayed.Version);
        Assert.Equal(2, afterDelayed.LastDeviceRev);

        var cursorAfterDelayed = (await db.SyncCursor.FindAsync(1))!.Value;
        Assert.Equal(cursorBeforeDelayed, cursorAfterDelayed);
    }

    [Fact]
    public async Task Push_SameDataDifferentMetadata_ReturnsDuplicate()
    {
        // 2.2: Enviar exactamente el mismo contenido lógico pero cambiar clientUpdatedAt y baseVersion
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();

        var initialTime = DateTimeOffset.UtcNow.AddHours(-1);
        var push1 = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.ClassSession,
                    Id = sessionId,
                    BaseVersion = 0,
                    ClientUpdatedAt = initialTime,
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(8), slot = "JORNADA", status = "TAKEN" })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    ClientUpdatedAt = initialTime,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "PRESENT" })
                }
            ]
        }, data.UserId);

        Assert.All(push1.Results, r => Assert.Equal(SyncItemStatus.Accepted, r.Status));
        var cursorBefore = push1.ServerCursor;

        var recordBefore = await db.AttendanceRecords.AsNoTracking().FirstAsync(r => r.Id == attId);
        var initialUpdatedAt = recordBefore.UpdatedAt;
        var initialVersion = recordBefore.Version;

        // Reenvío con datos lógicos idénticos pero diferente clientUpdatedAt y baseVersion
        var newClientTime = DateTimeOffset.UtcNow.AddMinutes(10);
        var push2 = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 99, // baseVersion diferente
                    ClientUpdatedAt = newClientTime, // fecha de cliente diferente
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "PRESENT" }) // mismo dato lógico
                }
            ]
        }, data.UserId);

        Assert.Single(push2.Results);
        Assert.Equal(SyncItemStatus.Duplicate, push2.Results[0].Status);
        Assert.Equal(initialVersion, push2.Results[0].ServerVersion);

        // Validar que no se incrementó versión, no cambió updated_at en BD y no se creó change_log
        var recordAfter = await db.AttendanceRecords.AsNoTracking().FirstAsync(r => r.Id == attId);
        Assert.Equal(initialVersion, recordAfter.Version);
        Assert.Equal(initialUpdatedAt, recordAfter.UpdatedAt);
        Assert.Equal(cursorBefore, push2.ServerCursor);
    }

    [Fact]
    public async Task Push_DuplicateAttendanceLogicalKey_ReturnsConflictWithCanonicalRecord()
    {
        // 2.3: attendance UUID A (session X, student Y) existe.
        // Enviar attendance UUID B (session X, student Y) -> conflict con canónico, sin crear segunda asistencia.
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var sessionId = Guid.NewGuid();
        var attIdA = Guid.NewGuid();
        var attIdB = Guid.NewGuid();

        // Crear sesión y asistencia A
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
                    Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(9), slot = "JORNADA", status = "TAKEN" })
                },
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attIdA,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "PRESENT" })
                }
            ]
        }, data.UserId);

        // Enviar asistencia B con diferente UUID pero misma clave lógica (session X, student Y)
        var respB = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev2,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attIdB,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId, studentId = data.StudentAId, status = "ABSENT" })
                }
            ]
        }, data.UserId);

        Assert.Single(respB.Results);
        Assert.Equal(SyncItemStatus.Conflict, respB.Results[0].Status);
        Assert.NotNull(respB.Results[0].Current);

        var currentJson = JsonSerializer.Serialize(respB.Results[0].Current);
        Assert.Contains(attIdA.ToString(), currentJson);

        // Comprobar que en BD no se creó la segunda asistencia
        var total = await db.AttendanceRecords.CountAsync(r => r.SessionId == sessionId && r.StudentId == data.StudentAId);
        Assert.Equal(1, total);
        Assert.Null(await db.AttendanceRecords.FindAsync(attIdB));
    }

    [Fact]
    public async Task Push_AttendanceBeforeSession_RejectsAttendanceWithoutOrphanRecord()
    {
        // 2.4: Si el lote envía asistencia antes que sesión, el servidor rechaza la asistencia
        // por sesión inexistente (cumple contrato: tablet envía sesión antes que asistencias).
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var proc = NewProcessor(db);

        var nonExistentSessionId = Guid.NewGuid();
        var attId = Guid.NewGuid();

        var resp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Dev1,
            Items =
            [
                new SyncPushItem
                {
                    Entity = EntityNames.AttendanceRecord,
                    Id = attId,
                    BaseVersion = 0,
                    Data = JsonSerializer.SerializeToElement(new { sessionId = nonExistentSessionId, studentId = data.StudentAId, status = "PRESENT" })
                }
            ]
        }, data.UserId);

        Assert.Single(resp.Results);
        Assert.Equal(SyncItemStatus.Rejected, resp.Results[0].Status);
        Assert.Contains("no encontrada", resp.Results[0].Error);

        // Jamás persiste un registro huérfano
        Assert.Null(await db.AttendanceRecords.FindAsync(attId));
    }

    [Fact]
    public async Task Push_ConcurrentEndpointRequests_SerializeCommits_AndNoGapsInIncrementalQuery()
    {
        // 2.1: Dos POST /api/sync simultáneos al procesador con diferentes contextos
        await using var dbMain = fx.CreateContext();
        var data = await BaseData.CreateAsync(dbMain);

        var queryService = NewQueryService(dbMain);
        var initialChanges = await queryService.GetChangesAsync(0);
        var baseCursor = initialChanges.NextCursor;

        var sessionId1 = Guid.NewGuid();
        var attId1 = Guid.NewGuid();

        var sessionId2 = Guid.NewGuid();
        var attId2 = Guid.NewGuid();

        var task1 = Task.Run(async () =>
        {
            await using var db1 = fx.CreateContext();
            var p1 = NewProcessor(db1);
            return await p1.ProcessPushAsync(new SyncPushRequest
            {
                DeviceId = Dev1,
                Items =
                [
                    new SyncPushItem
                    {
                        Entity = EntityNames.ClassSession,
                        Id = sessionId1,
                        BaseVersion = 0,
                        Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(11), slot = "HORA-1", status = "TAKEN" })
                    },
                    new SyncPushItem
                    {
                        Entity = EntityNames.AttendanceRecord,
                        Id = attId1,
                        BaseVersion = 0,
                        Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId1, studentId = data.StudentAId, status = "PRESENT" })
                    }
                ]
            }, data.UserId);
        });

        var task2 = Task.Run(async () =>
        {
            await using var db2 = fx.CreateContext();
            var p2 = NewProcessor(db2);
            return await p2.ProcessPushAsync(new SyncPushRequest
            {
                DeviceId = Dev2,
                Items =
                [
                    new SyncPushItem
                    {
                        Entity = EntityNames.ClassSession,
                        Id = sessionId2,
                        BaseVersion = 0,
                        Data = JsonSerializer.SerializeToElement(new { sectionId = data.SectionId, teacherId = data.TeacherId, date = Day.AddDays(12), slot = "HORA-2", status = "TAKEN" })
                    },
                    new SyncPushItem
                    {
                        Entity = EntityNames.AttendanceRecord,
                        Id = attId2,
                        BaseVersion = 0,
                        Data = JsonSerializer.SerializeToElement(new { sessionId = sessionId2, studentId = data.StudentBId, status = "LATE" })
                    }
                ]
            }, data.UserId);
        });

        var results = await Task.WhenAll(task1, task2);
        var r1 = results[0];
        var r2 = results[1];

        Assert.All(r1.Results, r => Assert.Equal(SyncItemStatus.Accepted, r.Status));
        Assert.All(r2.Results, r => Assert.Equal(SyncItemStatus.Accepted, r.Status));

        // Verificar que los cambios confirmados son continuos y no hay saltos
        await using var verifyDb = fx.CreateContext();
        var changes = await verifyDb.ChangeLog
            .Where(c => c.ServerChangeId > baseCursor)
            .OrderBy(c => c.ServerChangeId)
            .ToListAsync();

        Assert.Equal(4, changes.Count); // 2 sesiones + 2 asistencias
        var assignedIds = changes.Select(c => c.ServerChangeId).ToList();
        Assert.Equal(assignedIds.Distinct().Count(), assignedIds.Count); // Sin duplicados
        Assert.Equal(baseCursor + 4, changes.Max(c => c.ServerChangeId)); // Contiguos

        // Un query desde un cursor intermedio (baseCursor + 2) no pierde ningún cambio posterior
        var interChanges = await queryService.GetChangesAsync(baseCursor + 2);
        Assert.Equal(2, interChanges.Changes.Count);
        Assert.Equal(baseCursor + 4, interChanges.NextCursor);
    }
}
