using System.Text.RegularExpressions;
using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Api.Import;

public sealed record RosterImportResult
{
    public required bool Success { get; init; }
    public required int SectionsCreated { get; init; }
    public required int SectionsMatched { get; init; }
    public required int StudentsCreated { get; init; }
    public required int StudentsMatched { get; init; }
    public required int AmbiguousCount { get; init; }
    public required IReadOnlyList<string> Warnings { get; init; }
    public required IReadOnlyList<string> Errors { get; init; }

    public string FormatSummary()
    {
        var lines = new List<string>
        {
            "=== RESULTADO DE IMPORTACIÓN DE PADRÓN ===",
            $"Estado: {(Success ? "EXITOSO" : "FALLIDO")}",
            $"Secciones creadas (NEW): {SectionsCreated}",
            $"Secciones existentes (MATCHED): {SectionsMatched}",
            $"Alumnos nuevos (NEW): {StudentsCreated}",
            $"Alumnos existentes reconocidos (MATCHED): {StudentsMatched}",
            $"Casos ambiguos (AMBIGUOUS): {AmbiguousCount}"
        };

        if (Warnings.Count > 0)
        {
            lines.Add($"Advertencias ({Warnings.Count}):");
            foreach (var w in Warnings) lines.Add($"  • {w}");
        }

        if (Errors.Count > 0)
        {
            lines.Add($"Errores ({Errors.Count}):");
            foreach (var e in Errors) lines.Add($"  ❌ {e}");
        }

        return string.Join(Environment.NewLine, lines);
    }
}

public sealed class RosterImporter(AppDbContext db, ChangeLogWriter changes)
{
    private static readonly Regex StuCodeRegex = new(@"^STU-(\d+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// Importa un padrón de alumnos desde un archivo Excel a PostgreSQL respetando:
    /// 1. Idempotencia total: si se vuelve a importar el mismo archivo, no duplica secciones ni alumnos.
    /// 2. Registro obligatorio en change_log: toda inserción o actualización se registra mediante ChangeLogWriter.
    /// 3. Conservación de histórico: alumnos ausentes en el nuevo Excel NUNCA se borran de la base de datos.
    /// 4. Desacoplamiento de identidad: los códigos STU-XXXX son secuenciales e inmutables, jamás derivados del nombre.
    /// 5. Manejo de ambigüedad: homónimos o colisiones detienen la importación sin adivinar.
    /// </summary>
    public async Task<RosterImportResult> ImportAsync(
        Stream excelStream,
        Guid institutionId,
        Guid academicYearId,
        Guid teacherId,
        CancellationToken ct = default)
    {
        var dryRun = ExcelRosterParser.Analyze(excelStream);

        var warnings = new List<string>(dryRun.Warnings);
        var errors = new List<string>(dryRun.Errors);

        if (dryRun.Errors.Count > 0 || dryRun.HomonymsCount > 0)
        {
            return new RosterImportResult
            {
                Success = false,
                SectionsCreated = 0,
                SectionsMatched = 0,
                StudentsCreated = 0,
                StudentsMatched = 0,
                AmbiguousCount = dryRun.HomonymsCount,
                Warnings = warnings,
                Errors = errors
            };
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await changes.LockAsync(ct);

        var academicYear = await db.AcademicYears.FirstOrDefaultAsync(y => y.Id == academicYearId && y.InstitutionId == institutionId, ct);
        if (academicYear == null)
        {
            errors.Add($"No se encontró el año académico con ID {academicYearId} para la institución {institutionId}.");
            await tx.RollbackAsync(ct);
            return new RosterImportResult
            {
                Success = false,
                SectionsCreated = 0,
                SectionsMatched = 0,
                StudentsCreated = 0,
                StudentsMatched = 0,
                AmbiguousCount = 0,
                Warnings = warnings,
                Errors = errors
            };
        }

        // Cargar secciones existentes del año lectivo
        var existingSections = await db.Sections
            .Where(s => s.AcademicYearId == academicYearId)
            .ToListAsync(ct);

        // Cargar todos los alumnos existentes de la institución
        var existingStudents = await db.Students
            .Where(s => s.InstitutionId == institutionId)
            .ToListAsync(ct);

        // Cargar todas las matrículas del año escolar
        var existingEnrollments = await db.Enrollments
            .Include(e => e.Student)
            .Where(e => e.AcademicYearId == academicYearId)
            .ToListAsync(ct);

        // Determinar el número correlativo máximo actual de códigos STU-XXXX
        var maxSeq = 0;
        foreach (var st in existingStudents)
        {
            var m = StuCodeRegex.Match(st.Code);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var num) && num > maxSeq)
            {
                maxSeq = num;
            }
        }

        var sectionsCreated = 0;
        var sectionsMatched = 0;
        var studentsCreated = 0;
        var studentsMatched = 0;
        var ambiguousCount = 0;

        foreach (var parsedSec in dryRun.Sections)
        {
            // 1. Resolver Sección (MATCHED o NEW)
            var section = existingSections.FirstOrDefault(s =>
                s.Grade.Equals(parsedSec.Grade, StringComparison.OrdinalIgnoreCase) &&
                s.Name.Equals(parsedSec.Name, StringComparison.OrdinalIgnoreCase));

            if (section == null)
            {
                section = new Section
                {
                    Id = Guid.NewGuid(),
                    InstitutionId = institutionId,
                    AcademicYearId = academicYearId,
                    Grade = parsedSec.Grade,
                    Name = parsedSec.Name,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                db.Sections.Add(section);
                existingSections.Add(section);
                await changes.RecordAsync(EntityNames.Section, section.Id, ChangeOperation.Insert, ct: ct);
                sectionsCreated++;

                // Vincular docente a la nueva sección
                var link = new SectionTeacher
                {
                    Id = Guid.NewGuid(),
                    SectionId = section.Id,
                    TeacherId = teacherId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                db.SectionTeachers.Add(link);
                await changes.RecordAsync(EntityNames.SectionTeacher, link.Id, ChangeOperation.Insert, ct: ct);
            }
            else
            {
                sectionsMatched++;
            }

            // Obtener matrículas activas existentes para esta sección
            var sectionEnrollments = existingEnrollments
                .Where(e => e.SectionId == section.Id && e.Status == EnrollmentStatus.Active && e.Student != null)
                .ToList();

            var processedStudentIds = new HashSet<Guid>();

            // 2. Procesar alumnos de la sección
            foreach (var parsedStudent in parsedSec.Students)
            {
                var normParsedName = NormalizeName(parsedStudent.FullName);

                // Buscar coincidencias existentes en la sección
                var matchingEnrollments = sectionEnrollments
                    .Where(e => NormalizeName(e.Student!.FullName) == normParsedName)
                    .ToList();

                if (matchingEnrollments.Count > 1)
                {
                    // AMBIGUOUS: no se puede decidir automáticamente
                    ambiguousCount++;
                    errors.Add($"⚠ AMBIGÜEDAD en hoja '{parsedSec.SheetName}', fila {parsedStudent.RowNumber}: múltiples coincidencias en base de datos.");
                    continue;
                }

                if (matchingEnrollments.Count == 1)
                {
                    // MATCHED: alumno existente reconocido
                    var existingEnrollment = matchingEnrollments[0];
                    processedStudentIds.Add(existingEnrollment.StudentId);
                    studentsMatched++;
                }
                else
                {
                    // Verificar si el alumno ya existe en la institución (ej. cambio de sección)
                    var matchingStudents = existingStudents
                        .Where(s => NormalizeName(s.FullName) == normParsedName)
                        .ToList();

                    Student student;
                    if (matchingStudents.Count == 1)
                    {
                        student = matchingStudents[0];
                    }
                    else if (matchingStudents.Count > 1)
                    {
                        ambiguousCount++;
                        errors.Add($"⚠ AMBIGÜEDAD en hoja '{parsedSec.SheetName}', fila {parsedStudent.RowNumber}: múltiples coincidencias en la institución.");
                        continue;
                    }
                    else
                    {
                        // NEW: Crear nuevo alumno con correlativo desacoplado
                        maxSeq++;
                        var newCode = $"STU-{maxSeq:D4}";

                        student = new Student
                        {
                            Id = Guid.NewGuid(),
                            InstitutionId = institutionId,
                            Code = newCode,
                            FullName = parsedStudent.FullName,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        };
                        db.Students.Add(student);
                        existingStudents.Add(student);
                        await changes.RecordAsync(EntityNames.Student, student.Id, ChangeOperation.Insert, ct: ct);
                        studentsCreated++;
                    }

                    // Crear matrícula en la sección
                    var enrollment = new Enrollment
                    {
                        Id = Guid.NewGuid(),
                        StudentId = student.Id,
                        SectionId = section.Id,
                        AcademicYearId = academicYearId,
                        Status = EnrollmentStatus.Active,
                        StartDate = academicYear.StartDate,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    db.Enrollments.Add(enrollment);
                    existingEnrollments.Add(enrollment);
                    sectionEnrollments.Add(enrollment);
                    processedStudentIds.Add(student.Id);
                    await changes.RecordAsync(EntityNames.Enrollment, enrollment.Id, ChangeOperation.Insert, ct: ct);
                }
            }

            // 3. Verificar alumnos de la BD que ya no figuran en el Excel
            // REGLA CRÍTICA: NUNCA BORRAR. Se conservan para no romper asistencias históricas.
            var unmentionedInExcel = sectionEnrollments
                .Where(e => !processedStudentIds.Contains(e.StudentId))
                .ToList();

            if (unmentionedInExcel.Count > 0)
            {
                warnings.Add($"Hoja '{parsedSec.SheetName}': {unmentionedInExcel.Count} alumno(s) existentes en base de datos ya no figuran en el Excel. Se conservan en PostgreSQL con estado activo (no se borran para proteger el histórico).");
            }
        }

        if (ambiguousCount > 0 || errors.Count > 0)
        {
            await tx.RollbackAsync(ct);
            return new RosterImportResult
            {
                Success = false,
                SectionsCreated = 0,
                SectionsMatched = 0,
                StudentsCreated = 0,
                StudentsMatched = 0,
                AmbiguousCount = ambiguousCount,
                Warnings = warnings,
                Errors = errors
            };
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new RosterImportResult
        {
            Success = true,
            SectionsCreated = sectionsCreated,
            SectionsMatched = sectionsMatched,
            StudentsCreated = studentsCreated,
            StudentsMatched = studentsMatched,
            AmbiguousCount = 0,
            Warnings = warnings,
            Errors = []
        };
    }

    private static string NormalizeName(string name) =>
        Regex.Replace(name.Trim().ToUpperInvariant(), @"\s+", " ");
}
