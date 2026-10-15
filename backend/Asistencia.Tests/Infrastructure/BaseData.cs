using Asistencia.Api.Data;
using Asistencia.Api.Domain;

namespace Asistencia.Tests.Infrastructure;

/// <summary>Datos mínimos para pruebas de restricciones (sin pasar por change_log).</summary>
public sealed record BaseData(Guid InstitutionId, Guid UserId, Guid TeacherId, Guid AcademicYearId,
    Guid SectionId, Guid StudentAId, Guid StudentBId)
{
    public static async Task<BaseData> CreateAsync(AppDbContext db)
    {
        var inst = new Institution { Id = Guid.NewGuid(), Name = "IE Test" };
        var user = new User
        {
            Id = Guid.NewGuid(), InstitutionId = inst.Id, Username = $"u_{Guid.NewGuid():N}",
            PasswordHash = "x", Role = UserRole.Teacher,
        };
        var teacher = new Teacher { Id = Guid.NewGuid(), UserId = user.Id, FullName = "Docente Test" };
        var year = new AcademicYear
        {
            Id = Guid.NewGuid(), InstitutionId = inst.Id, Year = 2000 + Random.Shared.Next(100, 900),
            StartDate = new DateOnly(2026, 3, 1), EndDate = new DateOnly(2026, 12, 31),
        };
        var section = new Section
        {
            Id = Guid.NewGuid(), InstitutionId = inst.Id, AcademicYearId = year.Id,
            Grade = "1", Name = Guid.NewGuid().ToString("N")[..8],
        };
        var a = new Student { Id = Guid.NewGuid(), InstitutionId = inst.Id, Code = $"T{Guid.NewGuid():N}"[..12], FullName = "Alumno A" };
        var b = new Student { Id = Guid.NewGuid(), InstitutionId = inst.Id, Code = $"T{Guid.NewGuid():N}"[..12], FullName = "Alumno B" };

        var link = new SectionTeacher { Id = Guid.NewGuid(), SectionId = section.Id, TeacherId = teacher.Id };

        var enrA = new Enrollment
        {
            Id = Guid.NewGuid(),
            SectionId = section.Id,
            StudentId = a.Id,
            AcademicYearId = year.Id,
            Status = EnrollmentStatus.Active,
            StartDate = new DateOnly(2026, 3, 1)
        };
        var enrB = new Enrollment
        {
            Id = Guid.NewGuid(),
            SectionId = section.Id,
            StudentId = b.Id,
            AcademicYearId = year.Id,
            Status = EnrollmentStatus.Active,
            StartDate = new DateOnly(2026, 3, 1)
        };

        db.AddRange(inst, user, teacher, year, section, link, a, b, enrA, enrB);
        await db.SaveChangesAsync();
        return new BaseData(inst.Id, user.Id, teacher.Id, year.Id, section.Id, a.Id, b.Id);
    }

    public ClassSession NewSession(DateOnly date, string slot = ClassSession.DefaultSlot) => new()
    {
        Id = Guid.NewGuid(), SectionId = SectionId, TeacherId = TeacherId,
        Date = date, Slot = slot, Status = SessionStatus.Taken,
    };

    public static AttendanceRecord NewAttendance(Guid sessionId, Guid studentId,
        AttendanceStatus status = AttendanceStatus.Present) => new()
    {
        Id = Guid.NewGuid(), SessionId = sessionId, StudentId = studentId, Status = status,
    };
}
