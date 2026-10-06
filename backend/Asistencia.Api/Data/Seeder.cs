using Asistencia.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Api.Data;

public sealed class SeedOptions
{
    public bool Enabled { get; set; }
    public string InstitutionName { get; set; } = "I.E. Piloto Chumbivilcas";
    public string TeacherUsername { get; set; } = "docente";
    /// <summary>Obligatoria si Enabled = true. Se pasa por variable de entorno (Seed__TeacherPassword).</summary>
    public string TeacherPassword { get; set; } = "";
    public string TeacherFullName { get; set; } = "Docente de Prueba";
}

/// <summary>
/// Datos semilla ficticios: 1 institución, 1 docente, 1 sección y 30 alumnos (DEC-006).
/// Todo lo que la tablet debe descargar se registra en change_log.
/// </summary>
public sealed class Seeder(AppDbContext db, ChangeLogWriter changes, IPasswordHasher<User> hasher)
{
    // Nombres ficticios: no corresponden a alumnos reales.
    private static readonly string[] FictionalNames =
    [
        "Quispe Huamán, Ana", "Mamani Condori, Luis", "Huillca Ccori, Rosa", "Ccahuana Puma, José",
        "Choque Apaza, María", "Turpo Layme, Carlos", "Cusi Yupanqui, Elena", "Huamaní Soto, Pedro",
        "Condori Vilca, Julia", "Apaza Quispe, Miguel", "Ccopa Huanca, Lucía", "Layme Ccasa, Jorge",
        "Puma Chalco, Sofía", "Vilca Mendoza, Raúl", "Yupanqui Torres, Carmen", "Soto Huarca, Diego",
        "Chalco Ramos, Paola", "Huarca Lima, Andrés", "Ramos Ccama, Teresa", "Lima Ttito, Hugo",
        "Ccama Pari, Silvia", "Ttito Roque, Martín", "Pari Ancco, Gloria", "Roque Chura, Iván",
        "Ancco Huisa, Noemí", "Chura Quispe, Félix", "Huisa Mamani, Rocío", "Taco Condori, Alberto",
        "Mayta Choque, Liliana", "Sullca Turpo, Edwin",
    ];

    /// <summary>Siembra solo si la base está vacía. Devuelve true si sembró.</summary>
    public async Task<bool> SeedAsync(SeedOptions options, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(options.TeacherPassword))
            throw new InvalidOperationException("Seed habilitado pero falta Seed__TeacherPassword.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await changes.LockAsync(ct);

        if (await db.Institutions.AnyAsync(ct))
        {
            await tx.RollbackAsync(ct);
            return false;
        }

        var institution = new Institution { Id = Guid.NewGuid(), Name = options.InstitutionName };
        db.Institutions.Add(institution);

        var user = new User
        {
            Id = Guid.NewGuid(),
            InstitutionId = institution.Id,
            Username = options.TeacherUsername,
            Role = UserRole.Teacher,
        };
        user.PasswordHash = hasher.HashPassword(user, options.TeacherPassword);
        db.Users.Add(user);

        var teacher = new Teacher { Id = Guid.NewGuid(), UserId = user.Id, FullName = options.TeacherFullName };
        db.Teachers.Add(teacher);

        // [PROVISIONAL] Fechas del año escolar; ajustar con el calendario real.
        var year = LimaClock.Today().Year;
        var academicYear = new AcademicYear
        {
            Id = Guid.NewGuid(),
            InstitutionId = institution.Id,
            Year = year,
            StartDate = new DateOnly(year, 3, 1),
            EndDate = new DateOnly(year, 12, 31),
        };
        db.AcademicYears.Add(academicYear);
        await changes.RecordAsync(EntityNames.AcademicYear, academicYear.Id, ChangeOperation.Insert, ct: ct);

        var section = new Section
        {
            Id = Guid.NewGuid(),
            InstitutionId = institution.Id,
            AcademicYearId = academicYear.Id,
            Grade = "1",
            Name = "A",
        };
        db.Sections.Add(section);
        await changes.RecordAsync(EntityNames.Section, section.Id, ChangeOperation.Insert, ct: ct);

        var link = new SectionTeacher { Id = Guid.NewGuid(), SectionId = section.Id, TeacherId = teacher.Id };
        db.SectionTeachers.Add(link);
        await changes.RecordAsync(EntityNames.SectionTeacher, link.Id, ChangeOperation.Insert, ct: ct);

        for (var i = 0; i < FictionalNames.Length; i++)
        {
            var student = new Student
            {
                Id = Guid.NewGuid(),
                InstitutionId = institution.Id,
                Code = $"A{i + 1:000}", // [PROVISIONAL] formato de código interno
                FullName = FictionalNames[i],
            };
            db.Students.Add(student);
            await changes.RecordAsync(EntityNames.Student, student.Id, ChangeOperation.Insert, ct: ct);

            var enrollment = new Enrollment
            {
                Id = Guid.NewGuid(),
                StudentId = student.Id,
                SectionId = section.Id,
                AcademicYearId = academicYear.Id,
                Status = EnrollmentStatus.Active,
                StartDate = academicYear.StartDate,
            };
            db.Enrollments.Add(enrollment);
            await changes.RecordAsync(EntityNames.Enrollment, enrollment.Id, ChangeOperation.Insert, ct: ct);
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}
