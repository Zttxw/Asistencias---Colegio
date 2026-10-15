using System.Text.Json;
using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Asistencia.Api.Sync;
using Asistencia.Tests.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Tests;

/// <summary>
/// Pruebas obligatorias de autorización (Requisito 4):
/// Test 1: Docente A intenta modificar asistencia de Section B -> rejected / base sin cambios.
/// Test 2: Docente B intenta modificar asistencia de Section A -> rejected / base sin cambios.
/// Test 3: Docente A modifica asistencia de su propia sección -> accepted.
/// Test 4: Docente A consulta GET /api/sync/changes -> solo recibe datos de sus secciones asignadas.
/// Test 5: AUXILIARY consulta cambios -> recibe toda la información institucional permitida.
/// Test 6: AUXILIARY intenta POST /api/sync -> rejected sin cambios en la base.
/// </summary>
public sealed class SyncAuthorizationTests(PostgresFixture fx) : IClassFixture<PostgresFixture>
{
    private record TestSetup(
        Guid InstitutionId,
        Guid AcademicYearId,
        User TeacherAUser,
        Teacher TeacherA,
        Section SectionA,
        Student StudentA,
        ClassSession SessionA,
        User TeacherBUser,
        Teacher TeacherB,
        Section SectionB,
        Student StudentB,
        ClassSession SessionB,
        User AuxUser
    );

    private async Task<TestSetup> SetupEnvironmentAsync(AppDbContext db)
    {
        var hasher = new PasswordHasher<User>();
        var writer = new ChangeLogWriter(db);

        await using var tx = await db.Database.BeginTransactionAsync();
        await writer.LockAsync();

        var inst = new Institution { Id = Guid.NewGuid(), Name = "I.E. Piloto Chumbivilcas" };
        db.Institutions.Add(inst);

        var year = new AcademicYear
        {
            Id = Guid.NewGuid(),
            InstitutionId = inst.Id,
            Year = 2026,
            StartDate = new DateOnly(2026, 3, 1),
            EndDate = new DateOnly(2026, 12, 31)
        };
        db.AcademicYears.Add(year);
        await writer.RecordAsync(EntityNames.AcademicYear, year.Id, ChangeOperation.Insert);

        var suffix = Guid.NewGuid().ToString("N")[..8];

        // Teacher A & Section A
        var userA = new User { Id = Guid.NewGuid(), InstitutionId = inst.Id, Username = $"docente_a_{suffix}", Role = UserRole.Teacher };
        userA.PasswordHash = hasher.HashPassword(userA, "clave-docente-a");
        db.Users.Add(userA);
        var teacherA = new Teacher { Id = Guid.NewGuid(), UserId = userA.Id, FullName = "Docente A" };
        db.Teachers.Add(teacherA);

        var secA = new Section { Id = Guid.NewGuid(), InstitutionId = inst.Id, AcademicYearId = year.Id, Grade = "1", Name = $"A-{suffix}" };
        db.Sections.Add(secA);
        await writer.RecordAsync(EntityNames.Section, secA.Id, ChangeOperation.Insert);

        var stA = new SectionTeacher { Id = Guid.NewGuid(), SectionId = secA.Id, TeacherId = teacherA.Id };
        db.SectionTeachers.Add(stA);
        await writer.RecordAsync(EntityNames.SectionTeacher, stA.Id, ChangeOperation.Insert);

        var stuA = new Student { Id = Guid.NewGuid(), InstitutionId = inst.Id, Code = $"STU-A-{suffix}", FullName = "Alumno de Sec A" };
        db.Students.Add(stuA);
        await writer.RecordAsync(EntityNames.Student, stuA.Id, ChangeOperation.Insert);

        var enrA = new Enrollment { Id = Guid.NewGuid(), SectionId = secA.Id, StudentId = stuA.Id, AcademicYearId = year.Id, Status = EnrollmentStatus.Active, StartDate = new DateOnly(2026, 3, 1) };
        db.Enrollments.Add(enrA);
        await writer.RecordAsync(EntityNames.Enrollment, enrA.Id, ChangeOperation.Insert);

        var sessA = new ClassSession { Id = Guid.NewGuid(), SectionId = secA.Id, TeacherId = teacherA.Id, Date = new DateOnly(2026, 4, 1), Slot = "JORNADA", CourseName = "Matemática", Status = SessionStatus.Open, Version = 1 };
        db.ClassSessions.Add(sessA);
        await writer.RecordAsync(EntityNames.ClassSession, sessA.Id, ChangeOperation.Insert);

        // Teacher B & Section B
        var userB = new User { Id = Guid.NewGuid(), InstitutionId = inst.Id, Username = $"docente_b_{suffix}", Role = UserRole.Teacher };
        userB.PasswordHash = hasher.HashPassword(userB, "clave-docente-b");
        db.Users.Add(userB);
        var teacherB = new Teacher { Id = Guid.NewGuid(), UserId = userB.Id, FullName = "Docente B" };
        db.Teachers.Add(teacherB);

        var secB = new Section { Id = Guid.NewGuid(), InstitutionId = inst.Id, AcademicYearId = year.Id, Grade = "1", Name = $"B-{suffix}" };
        db.Sections.Add(secB);
        await writer.RecordAsync(EntityNames.Section, secB.Id, ChangeOperation.Insert);

        var stB = new SectionTeacher { Id = Guid.NewGuid(), SectionId = secB.Id, TeacherId = teacherB.Id };
        db.SectionTeachers.Add(stB);
        await writer.RecordAsync(EntityNames.SectionTeacher, stB.Id, ChangeOperation.Insert);

        var stuB = new Student { Id = Guid.NewGuid(), InstitutionId = inst.Id, Code = $"STU-B-{suffix}", FullName = "Alumno de Sec B" };
        db.Students.Add(stuB);
        await writer.RecordAsync(EntityNames.Student, stuB.Id, ChangeOperation.Insert);

        var enrB = new Enrollment { Id = Guid.NewGuid(), SectionId = secB.Id, StudentId = stuB.Id, AcademicYearId = year.Id, Status = EnrollmentStatus.Active, StartDate = new DateOnly(2026, 3, 1) };
        db.Enrollments.Add(enrB);
        await writer.RecordAsync(EntityNames.Enrollment, enrB.Id, ChangeOperation.Insert);

        var sessB = new ClassSession { Id = Guid.NewGuid(), SectionId = secB.Id, TeacherId = teacherB.Id, Date = new DateOnly(2026, 4, 1), Slot = "JORNADA", CourseName = "Comunicación", Status = SessionStatus.Open, Version = 1 };
        db.ClassSessions.Add(sessB);
        await writer.RecordAsync(EntityNames.ClassSession, sessB.Id, ChangeOperation.Insert);

        // Auxiliary
        var auxUser = new User { Id = Guid.NewGuid(), InstitutionId = inst.Id, Username = $"auxiliar_{suffix}", Role = UserRole.Auxiliary };
        auxUser.PasswordHash = hasher.HashPassword(auxUser, "clave-auxiliar");
        db.Users.Add(auxUser);

        await db.SaveChangesAsync();
        await tx.CommitAsync();

        return new TestSetup(
            inst.Id, year.Id,
            userA, teacherA, secA, stuA, sessA,
            userB, teacherB, secB, stuB, sessB,
            auxUser
        );
    }

    [Fact]
    public async Task Test1_TeacherA_TriesToModifyAttendanceOfSectionB_IsRejected_AndNoDbChanges()
    {
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var attendanceId = Guid.NewGuid();
        var item = new SyncPushItem
        {
            Id = attendanceId,
            Entity = EntityNames.AttendanceRecord,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sessionId = setup.SessionB.Id, // Sesión de la sección B
                studentId = setup.StudentB.Id,
                status = "Present",
                note = "Intento por Docente A",
                isVoid = false
            })
        };

        var initialChangeLogs = await db.ChangeLog.CountAsync();
        var initialCursor = (await db.SyncCursor.SingleAsync()).Value;

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherAUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("No autorizado", res.Error);

        // Verificar que la base de datos permanece estrictamente sin cambios
        Assert.Null(await db.AttendanceRecords.FindAsync(attendanceId));
        Assert.Equal(initialChangeLogs, await db.ChangeLog.CountAsync());
        Assert.Equal(initialCursor, (await db.SyncCursor.SingleAsync()).Value);
    }

    [Fact]
    public async Task Test2_TeacherB_TriesToModifyAttendanceOfSectionA_IsRejected_AndNoDbChanges()
    {
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var attendanceId = Guid.NewGuid();
        var item = new SyncPushItem
        {
            Id = attendanceId,
            Entity = EntityNames.AttendanceRecord,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sessionId = setup.SessionA.Id, // Sesión de la sección A
                studentId = setup.StudentA.Id,
                status = "Late",
                note = "Intento por Docente B",
                isVoid = false
            })
        };

        var initialChangeLogs = await db.ChangeLog.CountAsync();

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherBUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("No autorizado", res.Error);

        Assert.Null(await db.AttendanceRecords.FindAsync(attendanceId));
        Assert.Equal(initialChangeLogs, await db.ChangeLog.CountAsync());
    }

    [Fact]
    public async Task Test3_TeacherA_ModifiesAttendanceOfOwnSection_IsAccepted()
    {
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var attendanceId = Guid.NewGuid();
        var item = new SyncPushItem
        {
            Id = attendanceId,
            Entity = EntityNames.AttendanceRecord,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sessionId = setup.SessionA.Id, // Propia sesión de Sección A
                studentId = setup.StudentA.Id,
                status = "Present",
                note = "Asistencia válida docente A",
                isVoid = false
            })
        };

        var initialChangeLogs = await db.ChangeLog.CountAsync();

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherAUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Accepted, res.Status);

        var created = await db.AttendanceRecords.FindAsync(attendanceId);
        Assert.NotNull(created);
        Assert.Equal(AttendanceStatus.Present, created.Status);
        Assert.Equal(1, created.Version);
        Assert.Equal(initialChangeLogs + 1, await db.ChangeLog.CountAsync());
    }

    [Fact]
    public async Task Test4_TeacherA_QueriesSyncChanges_ReceivesOnlyAssignedSectionData()
    {
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var queryService = new SyncQueryService(db);

        // Docente A consulta cambios desde el cursor 0
        var changesResponse = await queryService.GetChangesAsync(cursor: 0, limit: 100, requestingUserId: setup.TeacherAUser.Id);

        Assert.NotEmpty(changesResponse.Changes);

        // Debe recibir sección A, pero NO sección B
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.Section && c.EntityId == setup.SectionA.Id);
        Assert.DoesNotContain(changesResponse.Changes, c => c.Entity == EntityNames.Section && c.EntityId == setup.SectionB.Id);

        // Debe recibir alumno A, pero NO alumno B
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.Student && c.EntityId == setup.StudentA.Id);
        Assert.DoesNotContain(changesResponse.Changes, c => c.Entity == EntityNames.Student && c.EntityId == setup.StudentB.Id);

        // Debe recibir sesión A, pero NO sesión B
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.ClassSession && c.EntityId == setup.SessionA.Id);
        Assert.DoesNotContain(changesResponse.Changes, c => c.Entity == EntityNames.ClassSession && c.EntityId == setup.SessionB.Id);

        // Regla 6.2: el cursor avanza hasta el máximo cambio de la página para que el cliente no se quede estancado
        var totalChanges = await db.ChangeLog.CountAsync();
        Assert.Equal(totalChanges, changesResponse.NextCursor);
    }

    [Fact]
    public async Task Test5_Auxiliary_QueriesSyncChanges_ReceivesAllInstitutionData()
    {
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var queryService = new SyncQueryService(db);

        // AUXILIARY consulta cambios para el reporte general de la escuela
        var changesResponse = await queryService.GetChangesAsync(cursor: 0, limit: 100, requestingUserId: setup.AuxUser.Id);

        Assert.NotEmpty(changesResponse.Changes);

        // Debe recibir ambas secciones
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.Section && c.EntityId == setup.SectionA.Id);
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.Section && c.EntityId == setup.SectionB.Id);

        // Debe recibir ambos alumnos
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.Student && c.EntityId == setup.StudentA.Id);
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.Student && c.EntityId == setup.StudentB.Id);

        // Debe recibir ambas sesiones
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.ClassSession && c.EntityId == setup.SessionA.Id);
        Assert.Contains(changesResponse.Changes, c => c.Entity == EntityNames.ClassSession && c.EntityId == setup.SessionB.Id);
    }

    [Fact]
    public async Task Test6_Auxiliary_TriesToPushSync_IsRejected_AndNoDbChanges()
    {
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var sessionAttemptId = Guid.NewGuid();
        var sessionItem = new SyncPushItem
        {
            Id = sessionAttemptId,
            Entity = EntityNames.ClassSession,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sectionId = setup.SectionA.Id,
                teacherId = setup.TeacherA.Id,
                date = new DateOnly(2026, 4, 2),
                slot = "2",
                courseName = "Intento Auxiliar",
                status = "Open"
            })
        };

        var initialChanges = await db.ChangeLog.CountAsync();
        var initialSessions = await db.ClassSessions.CountAsync();

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [sessionItem]
        }, setup.AuxUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("AUXILIARY", res.Error);

        Assert.Null(await db.ClassSessions.FindAsync(sessionAttemptId));
        Assert.Equal(initialSessions, await db.ClassSessions.CountAsync());
        Assert.Equal(initialChanges, await db.ChangeLog.CountAsync());
    }

    [Fact]
    public async Task TeacherA_TriesToCreateSessionForSectionB_IsRejected_AndNoDbChanges()
    {
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var sessionId = Guid.NewGuid();
        var item = new SyncPushItem
        {
            Id = sessionId,
            Entity = EntityNames.ClassSession,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sectionId = setup.SectionB.Id, // Sección B no asignada a Docente A
                teacherId = setup.TeacherA.Id,
                date = new DateOnly(2026, 4, 3),
                slot = "1",
                courseName = "Invasión de sección",
                status = "Open"
            })
        };

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherAUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("No autorizado", res.Error);
        Assert.Null(await db.ClassSessions.FindAsync(sessionId));
    }

    [Fact]
    public async Task Attendance_SessionOfSectionB_PayloadDeclaringSectionA_TeacherA_IsRejected()
    {
        // Requisito 1: La sección debe resolverse desde el servidor. No confiar en sectionId enviado por el cliente.
        // Sesión de Section B + payload declarando Section A + Teacher A -> Rechazado
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var initialRecords = await db.AttendanceRecords.CountAsync();
        var initialChanges = await db.ChangeLog.CountAsync();
        var attId = Guid.NewGuid();

        var item = new SyncPushItem
        {
            Id = attId,
            Entity = EntityNames.AttendanceRecord,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sessionId = setup.SessionB.Id,   // Sesión pertenece a Section B en el servidor
                sectionId = setup.SectionA.Id,   // Cliente intenta declarar Section A
                studentId = setup.StudentB.Id,
                status = "Present"
            })
        };

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherAUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("No autorizado", res.Error);

        Assert.Null(await db.AttendanceRecords.FindAsync(attId));
        Assert.Equal(initialRecords, await db.AttendanceRecords.CountAsync());
        Assert.Equal(initialChanges, await db.ChangeLog.CountAsync());
    }

    [Fact]
    public async Task Attendance_StudentBelongsToSectionB_SessionOfSectionA_TeacherA_IsRejected()
    {
        // Requisito 2: Validar matrícula del alumno en la sección de la sesión.
        // Teacher A, Session A, Student perteneciente a Section B -> rejected.
        // No modificar attendance_record, version, change_log, sync_cursor.
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var initialRecords = await db.AttendanceRecords.CountAsync();
        var initialChanges = await db.ChangeLog.CountAsync();
        var initialCursor = (await db.SyncCursor.FirstAsync()).Value;
        var initialSessionVersion = setup.SessionA.Version;
        var attId = Guid.NewGuid();

        var item = new SyncPushItem
        {
            Id = attId,
            Entity = EntityNames.AttendanceRecord,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sessionId = setup.SessionA.Id, // Sesión de Sección A
                studentId = setup.StudentB.Id, // Alumno matriculado en Sección B
                status = "Present"
            })
        };

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherAUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("matrícula activa", res.Error);

        // Sin modificaciones en la base de datos
        Assert.Null(await db.AttendanceRecords.FindAsync(attId));
        Assert.Equal(initialRecords, await db.AttendanceRecords.CountAsync());
        Assert.Equal(initialChanges, await db.ChangeLog.CountAsync());

        var reloadedSession = await db.ClassSessions.FindAsync(setup.SessionA.Id);
        Assert.NotNull(reloadedSession);
        Assert.Equal(initialSessionVersion, reloadedSession.Version);

        var currentCursor = (await db.SyncCursor.FirstAsync()).Value;
        Assert.Equal(initialCursor, currentCursor);
    }

    [Fact]
    public async Task Attendance_StudentNotEnrolledInAnySection_IsRejected()
    {
        // Requisito 2: Alumno no matriculado en ninguna sección no puede ser utilizado.
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        // Crear alumno sin matrícula
        var unenrolledStudent = new Student
        {
            Id = Guid.NewGuid(),
            InstitutionId = setup.InstitutionId,
            Code = "STU-UNENROLLED",
            FullName = "Alumno Sin Matricula"
        };
        db.Students.Add(unenrolledStudent);
        await db.SaveChangesAsync();

        var attId = Guid.NewGuid();
        var item = new SyncPushItem
        {
            Id = attId,
            Entity = EntityNames.AttendanceRecord,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sessionId = setup.SessionA.Id,
                studentId = unenrolledStudent.Id,
                status = "Present"
            })
        };

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherAUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("matrícula activa", res.Error);
        Assert.Null(await db.AttendanceRecords.FindAsync(attId));
    }

    [Fact]
    public async Task TeacherA_PushesSession_PayloadAttemptsTeacherB_IsRejected()
    {
        // Requisito 3: Teacher A no debe poder enviar un payload que asigne teacher_id = Teacher B.
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var initialSessions = await db.ClassSessions.CountAsync();
        var initialChanges = await db.ChangeLog.CountAsync();
        var sessionId = Guid.NewGuid();

        var item = new SyncPushItem
        {
            Id = sessionId,
            Entity = EntityNames.ClassSession,
            BaseVersion = 0,
            LocalRev = 1,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sectionId = setup.SectionA.Id, // Sección asignada a Teacher A
                teacherId = setup.TeacherB.Id, // Intento de escalar / asignar a Teacher B
                date = new DateOnly(2026, 4, 10),
                slot = "JORNADA",
                courseName = "Matemática",
                status = "Open"
            })
        };

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherAUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("No autorizado", res.Error);
        Assert.Contains("otro docente", res.Error);

        Assert.Null(await db.ClassSessions.FindAsync(sessionId));
        Assert.Equal(initialSessions, await db.ClassSessions.CountAsync());
        Assert.Equal(initialChanges, await db.ChangeLog.CountAsync());
    }

    [Fact]
    public async Task TeacherA_PushesUpdateToExistingSession_PayloadAttemptsToChangeTeacherId_IsRejected()
    {
        // Requisito 3: Modificar sesión existente para cambiar teacher_id a Teacher B debe rechazarse.
        await using var db = fx.CreateContext();
        var setup = await SetupEnvironmentAsync(db);
        var proc = new SyncProcessor(db, new ChangeLogWriter(db));

        var initialChanges = await db.ChangeLog.CountAsync();

        var item = new SyncPushItem
        {
            Id = setup.SessionA.Id,
            Entity = EntityNames.ClassSession,
            BaseVersion = setup.SessionA.Version,
            LocalRev = 2,
            ClientUpdatedAt = DateTimeOffset.UtcNow,
            Data = JsonSerializer.SerializeToElement(new
            {
                sectionId = setup.SectionA.Id,
                teacherId = setup.TeacherB.Id, // Intento de reasignar docente
                date = setup.SessionA.Date,
                slot = setup.SessionA.Slot,
                courseName = setup.SessionA.CourseName,
                status = setup.SessionA.Status.ToString()
            })
        };

        var pushResp = await proc.ProcessPushAsync(new SyncPushRequest
        {
            DeviceId = Guid.NewGuid(),
            Items = [item]
        }, setup.TeacherAUser.Id);

        var res = Assert.Single(pushResp.Results);
        Assert.Equal(SyncItemStatus.Rejected, res.Status);
        Assert.Contains("No autorizado", res.Error);

        var reloaded = await db.ClassSessions.FindAsync(setup.SessionA.Id);
        Assert.NotNull(reloaded);
        Assert.Equal(setup.TeacherA.Id, reloaded.TeacherId); // No se modificó el docente
        Assert.Equal(setup.SessionA.Version, reloaded.Version); // No se incrementó versión
        Assert.Equal(initialChanges, await db.ChangeLog.CountAsync()); // No se generó changelog
    }
}
