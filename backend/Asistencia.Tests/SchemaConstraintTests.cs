using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Asistencia.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Asistencia.Tests;

/// <summary>
/// Criterio de salida de la Fase 1: la base de datos (no el código) rechaza duplicados
/// de asistencia (sesión, alumno) y de sesión (sección, fecha, slot).
/// </summary>
public sealed class SchemaConstraintTests(PostgresFixture fx) : IClassFixture<PostgresFixture>
{
    private static readonly DateOnly Day = new(2026, 10, 5);

    [Fact]
    public async Task SecondAttendanceRecord_ForSameSessionAndStudent_IsRejectedByDatabase()
    {
        BaseData data;
        ClassSession session;
        await using (var db = fx.CreateContext())
        {
            data = await BaseData.CreateAsync(db);
            session = data.NewSession(Day);
            db.ClassSessions.Add(session);
            db.AttendanceRecords.Add(BaseData.NewAttendance(session.Id, data.StudentAId));
            await db.SaveChangesAsync();
        }

        // Otro UUID para el mismo alumno y la misma sesión (p. ej. tablet reinstalada).
        await using var db2 = fx.CreateContext();
        db2.AttendanceRecords.Add(BaseData.NewAttendance(session.Id, data.StudentAId, AttendanceStatus.Absent));

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db2.SaveChangesAsync());
        AssertUniqueViolation(ex, AppDbContext.UxAttendanceSessionStudent);

        await using var db3 = fx.CreateContext();
        Assert.Equal(1, await db3.AttendanceRecords.CountAsync(r => r.SessionId == session.Id && r.StudentId == data.StudentAId));
    }

    [Fact]
    public async Task SecondClassSession_ForSameSectionDateAndSlot_IsRejectedByDatabase()
    {
        BaseData data;
        await using (var db = fx.CreateContext())
        {
            data = await BaseData.CreateAsync(db);
            db.ClassSessions.Add(data.NewSession(Day));
            await db.SaveChangesAsync();
        }

        await using var db2 = fx.CreateContext();
        db2.ClassSessions.Add(data.NewSession(Day)); // otro UUID, misma sección/fecha/slot

        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db2.SaveChangesAsync());
        AssertUniqueViolation(ex, AppDbContext.UxSessionSectionDateSlot);
    }

    [Fact]
    public async Task ClassSessions_WithDifferentSlotOrDate_AreAllowed()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        db.ClassSessions.AddRange(
            data.NewSession(Day),
            data.NewSession(Day, "HORA-2"),
            data.NewSession(Day.AddDays(1)));
        await db.SaveChangesAsync();

        Assert.Equal(3, await db.ClassSessions.CountAsync(s => s.SectionId == data.SectionId));
    }

    [Fact]
    public async Task DifferentStudents_InSameSession_AreAllowed()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var session = data.NewSession(Day);
        db.ClassSessions.Add(session);
        db.AttendanceRecords.AddRange(
            BaseData.NewAttendance(session.Id, data.StudentAId),
            BaseData.NewAttendance(session.Id, data.StudentBId, AttendanceStatus.Late));
        await db.SaveChangesAsync();

        Assert.Equal(2, await db.AttendanceRecords.CountAsync(r => r.SessionId == session.Id));
    }

    [Fact]
    public async Task Enrollment_OnlyOneActivePerStudentAndYear_WithdrawnKeepsHistory()
    {
        await using var db = fx.CreateContext();
        var data = await BaseData.CreateAsync(db);
        var otherSection = new Section
        {
            Id = Guid.NewGuid(), InstitutionId = data.InstitutionId, AcademicYearId = data.AcademicYearId,
            Grade = "1", Name = "B-" + Guid.NewGuid().ToString("N")[..6],
        };
        db.Sections.Add(otherSection);

        // Traslado: la matrícula anterior queda WITHDRAWN y se crea una nueva ACTIVE.
        db.Enrollments.AddRange(
            NewEnrollment(data, data.SectionId, EnrollmentStatus.Withdrawn, new DateOnly(2026, 3, 1), new DateOnly(2026, 6, 30)),
            NewEnrollment(data, otherSection.Id, EnrollmentStatus.Active, new DateOnly(2026, 7, 1), null));
        await db.SaveChangesAsync();

        await using var db2 = fx.CreateContext();
        db2.Enrollments.Add(NewEnrollment(data, data.SectionId, EnrollmentStatus.Active, new DateOnly(2026, 8, 1), null));
        var ex = await Assert.ThrowsAsync<DbUpdateException>(() => db2.SaveChangesAsync());
        AssertUniqueViolation(ex, AppDbContext.UxEnrollmentActivePerYear);
    }

    [Theory]
    [InlineData("UNKNOWN")]
    [InlineData("present")]
    public async Task AttendanceStatus_OutsideAllowedValues_IsRejectedByCheckConstraint(string badStatus)
    {
        Guid sessionId, studentId;
        await using (var db = fx.CreateContext())
        {
            var data = await BaseData.CreateAsync(db);
            var session = data.NewSession(Day.AddDays(10));
            db.ClassSessions.Add(session);
            await db.SaveChangesAsync();
            (sessionId, studentId) = (session.Id, data.StudentAId);
        }

        await using var db2 = fx.CreateContext();
        var ex = await Assert.ThrowsAsync<PostgresException>(() => db2.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO attendance_records (id, session_id, student_id, status, version, server_change_id,
                chain_base_version, is_void, created_at, updated_at)
            VALUES ({Guid.NewGuid()}, {sessionId}, {studentId}, {badStatus}, 1, 0, 0, false, now(), now())
            """));
        Assert.Equal(PostgresErrorCodes.CheckViolation, ex.SqlState);
    }

    [Fact]
    public async Task SyncCursor_IsSingleRow_WithIdOne()
    {
        await using var db = fx.CreateContext();
        var rows = await db.SyncCursor.AsNoTracking().ToListAsync();
        Assert.Single(rows);
        Assert.Equal(1, rows[0].Id);

        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlRawAsync("INSERT INTO sync_cursor (id, value) VALUES (2, 0)"));
        Assert.Equal(PostgresErrorCodes.CheckViolation, ex.SqlState);
    }

    private static Enrollment NewEnrollment(BaseData d, Guid sectionId, EnrollmentStatus status, DateOnly start, DateOnly? end) => new()
    {
        Id = Guid.NewGuid(), StudentId = d.StudentAId, SectionId = sectionId, AcademicYearId = d.AcademicYearId,
        Status = status, StartDate = start, EndDate = end,
    };

    private static void AssertUniqueViolation(DbUpdateException ex, string constraint)
    {
        var pg = Assert.IsType<PostgresException>(ex.InnerException);
        Assert.Equal(PostgresErrorCodes.UniqueViolation, pg.SqlState);
        Assert.Equal(constraint, pg.ConstraintName);
    }
}
