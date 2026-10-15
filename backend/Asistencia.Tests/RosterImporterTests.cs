using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Asistencia.Api.Import;
using Asistencia.Api.Sync;
using Asistencia.Tests.Infrastructure;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Asistencia.Tests;

public sealed class RosterImporterTests(PostgresFixture fx) : IClassFixture<PostgresFixture>
{
    private static async Task<(Guid InstitutionId, Guid AcademicYearId, Guid TeacherId)> EnsureBaseDataAsync(AppDbContext db)
    {
        var inst = await db.Institutions.FirstOrDefaultAsync();
        if (inst == null)
        {
            inst = new Institution { Id = Guid.NewGuid(), Name = "Institución de Prueba Ficticia" };
            db.Institutions.Add(inst);
        }

        var year = await db.AcademicYears.FirstOrDefaultAsync(y => y.InstitutionId == inst.Id);
        if (year == null)
        {
            year = new AcademicYear
            {
                Id = Guid.NewGuid(),
                InstitutionId = inst.Id,
                Year = 2026,
                StartDate = new DateOnly(2026, 3, 1),
                EndDate = new DateOnly(2026, 12, 31)
            };
            db.AcademicYears.Add(year);
        }

        var teacher = await db.Teachers.FirstOrDefaultAsync();
        if (teacher == null)
        {
            var user = new User { Id = Guid.NewGuid(), InstitutionId = inst.Id, Username = "docente_test" };
            db.Users.Add(user);
            teacher = new Teacher { Id = Guid.NewGuid(), UserId = user.Id, FullName = "Profesor de Prueba" };
            db.Teachers.Add(teacher);
        }

        await db.SaveChangesAsync();
        return (inst.Id, year.Id, teacher.Id);
    }

    [Fact]
    public async Task Import_EndToEnd_RecordsChangesInChangeLog_AndSyncChangesStreamsToTablet()
    {
        await using var db = fx.CreateContext();
        var (instId, yearId, teacherId) = await EnsureBaseDataAsync(db);

        var writer = new ChangeLogWriter(db);
        var importer = new RosterImporter(db, writer);

        // Generar Excel con nombres puramente ficticios
        var excelBytes = BuildSyntheticExcel(
            ("2A", "2 \"A\"", [
                ["2 \"A\"", "MES DE OCTUBRE 2026"],
                ["", "1", "2", "3"],
                ["N°", "APELLIDOS Y NOMBRES"],
                ["1", "QUISPE MAMANI, CARLOS"],
                ["2", "TORRES ROJAS, ANA"]
            ]),
            ("2B", "2 \"B\"", [
                ["2 \"B\"", "MES DE OCTUBRE 2026"],
                ["", "1", "2", "3"],
                ["N°", "APELLIDOS Y NOMBRES"],
                ["1", "MENDOZA FLORES, LUIS"]
            ])
        );

        // 1. Capturar cursor previo y ejecutar importación inicial
        var cursorBefore = await db.SyncCursor.Where(c => c.Id == 1).Select(c => c.Value).FirstOrDefaultAsync();

        using var stream1 = new MemoryStream(excelBytes);
        var result = await importer.ImportAsync(stream1, instId, yearId, teacherId);

        Assert.True(result.Success);
        Assert.Equal(2, result.SectionsCreated);
        Assert.Equal(3, result.StudentsCreated);
        Assert.Equal(0, result.StudentsMatched);
        Assert.Equal(0, result.AmbiguousCount);

        // 2. Verificar que los cambios están en change_log y son entregados por SyncQueryService a la tablet
        var syncService = new SyncQueryService(db);
        var changesResp = await syncService.GetChangesAsync(cursor: cursorBefore, limit: 100);

        Assert.NotEmpty(changesResp.Changes);
        Assert.Contains(changesResp.Changes, c => c.Entity == EntityNames.Section);
        Assert.Contains(changesResp.Changes, c => c.Entity == EntityNames.Student);
        Assert.Contains(changesResp.Changes, c => c.Entity == EntityNames.Enrollment);

        // Verificar formato de códigos de alumno (secuencial STU-XXXX, no hash)
        var studentChanges = changesResp.Changes.Where(c => c.Entity == EntityNames.Student).ToList();
        Assert.Equal(3, studentChanges.Count);

        var studentInDb = await db.Students.FirstOrDefaultAsync(s => s.FullName == "QUISPE MAMANI, CARLOS");
        Assert.NotNull(studentInDb);
        Assert.StartsWith("STU-", studentInDb.Code);
    }

    [Fact]
    public async Task Import_SameExcelTwice_IsStrictlyIdempotent()
    {
        await using var db = fx.CreateContext();
        var (instId, yearId, teacherId) = await EnsureBaseDataAsync(db);

        var writer = new ChangeLogWriter(db);
        var importer = new RosterImporter(db, writer);

        var excelBytes = BuildSyntheticExcel(
            ("3A", "3 \"A\"", [
                ["3 \"A\"", "MES DE OCTUBRE 2026"],
                ["", "1", "2", "3"],
                ["N°", "APELLIDOS Y NOMBRES"],
                ["1", "CONDORI SOTO, PEDRO"],
                ["2", "HUAMAN LIMA, MARIA"]
            ])
        );

        // Primera importación: crea secciones y alumnos (NEW)
        using (var s1 = new MemoryStream(excelBytes))
        {
            var r1 = await importer.ImportAsync(s1, instId, yearId, teacherId);
            Assert.True(r1.Success);
            Assert.Equal(1, r1.SectionsCreated);
            Assert.Equal(2, r1.StudentsCreated);
        }

        var countBefore = await db.Students.CountAsync();
        var enrollmentsBefore = await db.Enrollments.CountAsync();

        // Segunda importación con el mismo Excel: reconoce alumnos (MATCHED, 0 NEW)
        using (var s2 = new MemoryStream(excelBytes))
        {
            var r2 = await importer.ImportAsync(s2, instId, yearId, teacherId);
            Assert.True(r2.Success);
            Assert.Equal(0, r2.SectionsCreated);
            Assert.Equal(1, r2.SectionsMatched);
            Assert.Equal(0, r2.StudentsCreated);
            Assert.Equal(2, r2.StudentsMatched);
        }

        var countAfter = await db.Students.CountAsync();
        var enrollmentsAfter = await db.Enrollments.CountAsync();

        // La cantidad de alumnos en base de datos es IDÉNTICA (idempotencia perfecta)
        Assert.Equal(countBefore, countAfter);
        Assert.Equal(enrollmentsBefore, enrollmentsAfter);
    }

    [Fact]
    public async Task Import_StudentOmittedFromNewExcel_DoesNotHardDeleteFromDatabase()
    {
        await using var db = fx.CreateContext();
        var (instId, yearId, teacherId) = await EnsureBaseDataAsync(db);

        var writer = new ChangeLogWriter(db);
        var importer = new RosterImporter(db, writer);

        // Excel original con 2 alumnos
        var originalBytes = BuildSyntheticExcel(
            ("3B", "3 \"B\"", [
                ["3 \"B\"", "MES DE OCTUBRE 2026"],
                ["", "1", "2", "3"],
                ["N°", "APELLIDOS Y NOMBRES"],
                ["1", "CHAVEZ PEÑA, JULIO"],
                ["2", "RAMOS VILCA, SOFIA"]
            ])
        );

        using (var s1 = new MemoryStream(originalBytes))
        {
            var r1 = await importer.ImportAsync(s1, instId, yearId, teacherId);
            Assert.True(r1.Success);
        }

        // Nuevo Excel donde RAMOS VILCA, SOFIA ya no está (fue omitida/retirada)
        var updatedBytes = BuildSyntheticExcel(
            ("3B", "3 \"B\"", [
                ["3 \"B\"", "MES DE OCTUBRE 2026"],
                ["", "1", "2", "3"],
                ["N°", "APELLIDOS Y NOMBRES"],
                ["1", "CHAVEZ PEÑA, JULIO"]
            ])
        );

        using (var s2 = new MemoryStream(updatedBytes))
        {
            var r2 = await importer.ImportAsync(s2, instId, yearId, teacherId);
            Assert.True(r2.Success);
            Assert.Equal(1, r2.StudentsMatched);
            // Emite advertencia sobre alumno no mencionado
            Assert.Contains(r2.Warnings, w => w.Contains("ya no figuran en el Excel"));
        }

        // VERIFICACIÓN CLAVE: El alumno omitido NO fue borrado de PostgreSQL
        var studentStillExists = await db.Students.AnyAsync(s => s.FullName == "RAMOS VILCA, SOFIA");
        Assert.True(studentStillExists, "El alumno jamás debe ser eliminado físicamente de PostgreSQL.");

        var enrollmentStillExists = await db.Enrollments.AnyAsync(e => e.Student != null && e.Student.FullName == "RAMOS VILCA, SOFIA");
        Assert.True(enrollmentStillExists, "La matrícula histórica debe permanecer protegida.");
    }

    [Fact]
    public async Task Import_HomonymInSameSection_ReturnsAmbiguousAndRollsBack()
    {
        await using var db = fx.CreateContext();
        var (instId, yearId, teacherId) = await EnsureBaseDataAsync(db);

        var writer = new ChangeLogWriter(db);
        var importer = new RosterImporter(db, writer);

        // Excel con 2 alumnos con exactamente el mismo nombre en la misma sección
        var homonymBytes = BuildSyntheticExcel(
            ("3C", "3 \"C\"", [
                ["3 \"C\"", "MES DE OCTUBRE 2026"],
                ["", "1", "2", "3"],
                ["N°", "APELLIDOS Y NOMBRES"],
                ["1", "SANCHEZ CORNEJO, JORGE"],
                ["2", "SANCHEZ CORNEJO, JORGE"]
            ])
        );

        var countBefore = await db.Students.CountAsync();

        using var stream = new MemoryStream(homonymBytes);
        var result = await importer.ImportAsync(stream, instId, yearId, teacherId);

        // Debe fallar con ambigüedad y no adivinar identidades
        Assert.False(result.Success);
        Assert.True(result.AmbiguousCount > 0);
        Assert.Equal(countBefore, await db.Students.CountAsync());
    }

    private static byte[] BuildSyntheticExcel(params (string SheetName, string? CellA1, string[][] Rows)[] sheets)
    {
        using var ms = new MemoryStream();
        using (var doc = SpreadsheetDocument.Create(ms, SpreadsheetDocumentType.Workbook))
        {
            var wbPart = doc.AddWorkbookPart();
            wbPart.Workbook = new Workbook();
            var sheetsElement = wbPart.Workbook.AppendChild(new Sheets());

            uint sheetId = 1;
            foreach (var (sheetName, cellA1, rows) in sheets)
            {
                var wsPart = wbPart.AddNewPart<WorksheetPart>();
                var sheetData = new SheetData();
                wsPart.Worksheet = new Worksheet(sheetData);

                var relId = wbPart.GetIdOfPart(wsPart);
                var sheet = new Sheet
                {
                    Id = relId,
                    SheetId = sheetId++,
                    Name = sheetName
                };
                sheetsElement.Append(sheet);

                for (var rIdx = 0; rIdx < rows.Length; rIdx++)
                {
                    var rowData = rows[rIdx];
                    var rowElem = new Row { RowIndex = (uint)(rIdx + 1) };
                    sheetData.Append(rowElem);

                    for (var cIdx = 0; cIdx < rowData.Length; cIdx++)
                    {
                        var colLetter = GetColLetter(cIdx + 1);
                        var cellVal = rowData[cIdx];
                        if (rIdx == 0 && cIdx == 0 && cellA1 != null) cellVal = cellA1;

                        var cell = new Cell
                        {
                            CellReference = $"{colLetter}{rIdx + 1}",
                            DataType = CellValues.String,
                            CellValue = new CellValue(cellVal)
                        };
                        rowElem.Append(cell);
                    }
                }
            }

            wbPart.Workbook.Save();
        }

        return ms.ToArray();
    }

    private static string GetColLetter(int colNumber)
    {
        var dividend = colNumber;
        var columnName = string.Empty;
        while (dividend > 0)
        {
            var modulo = (dividend - 1) % 26;
            columnName = Convert.ToChar(65 + modulo) + columnName;
            dividend = (dividend - modulo) / 26;
        }
        return columnName;
    }
}
