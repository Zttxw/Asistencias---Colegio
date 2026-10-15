using System.Text;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;

namespace Asistencia.Api.Import;

public sealed record ParsedStudent
{
    public required int RowNumber { get; init; }
    public int? OrderNumber { get; init; }
    public required string RawFullName { get; init; }
    public required string FullName { get; init; }
    public required string ProvisionalCode { get; init; }
    public bool HasTwoCommasFormat { get; init; }
    public bool IsPossibleHomonym { get; set; }
}

public sealed record ParsedSection
{
    public required string SheetName { get; init; }
    public required string Grade { get; init; }
    public required string Name { get; init; }
    public required int HeaderRow { get; init; }
    public required IReadOnlyList<ParsedStudent> Students { get; init; }
    public required int IgnoredRowsCount { get; init; }
}

public sealed record RosterDryRunReport
{
    public required int SectionsCount { get; init; }
    public required int ValidStudentsCount { get; init; }
    public required int IgnoredRowsCount { get; init; }
    public required int NewStudentsCount { get; init; }
    public required int HomonymsCount { get; init; }
    public required IReadOnlyList<string> Warnings { get; init; }
    public required IReadOnlyList<string> Errors { get; init; }
    public required IReadOnlyList<ParsedSection> Sections { get; init; }

    public string FormatSummary()
    {
        var sb = new StringBuilder();
        sb.AppendLine("=== REPORTE DE ANÁLISIS DRY-RUN (EXCEL) ===");
        sb.AppendLine($"Secciones detectadas: {SectionsCount}");
        foreach (var sec in Sections)
        {
            sb.AppendLine($"  • {sec.Grade}° \"{sec.Name}\" (hoja \"{sec.SheetName}\"): {sec.Students.Count} alumnos válidos, {sec.IgnoredRowsCount} filas ignoradas");
        }
        sb.AppendLine($"Alumnos válidos: {ValidStudentsCount}");
        sb.AppendLine($"Filas ignoradas: {IgnoredRowsCount}");
        sb.AppendLine($"Alumnos nuevos: {NewStudentsCount}");
        sb.AppendLine($"Posibles homónimos: {HomonymsCount}");
        if (Warnings.Count > 0)
        {
            sb.AppendLine($"Advertencias ({Warnings.Count}):");
            foreach (var w in Warnings)
                sb.AppendLine($"  • {w}");
        }
        else
        {
            sb.AppendLine("Advertencias: 0");
        }
        if (Errors.Count > 0)
        {
            sb.AppendLine($"Errores ({Errors.Count}):");
            foreach (var e in Errors)
                sb.AppendLine($"  ❌ {e}");
        }
        else
        {
            sb.AppendLine("Errores: 0");
        }
        return sb.ToString();
    }
}

public static class ExcelRosterParser
{
    private static readonly Regex GradeSectionRegex = new(@"^(\d+)\s*[""“”']?\s*([A-Za-z])", RegexOptions.Compiled);
    private static readonly Regex ColLetterRegex = new(@"^[A-Za-z]+", RegexOptions.Compiled);

    /// <summary>
    /// Formato estándar para códigos secuenciales de alumno (STU-0001, STU-0002...).
    /// Desacoplado 100% de datos personales o nombres de menores.
    /// </summary>
    public static string FormatStudentCode(int sequence) => $"STU-{sequence:D4}";

    /// <summary>
    /// Analiza en memoria un archivo Excel (.xlsx) y produce un reporte de auditoría / dry-run
    /// sin interactuar con la base de datos ni persistir datos.
    /// Protege la privacidad de menores: las advertencias y errores solo refieren hoja y fila, jamás nombres reales.
    /// </summary>
    public static RosterDryRunReport Analyze(Stream excelStream)
    {
        var warnings = new List<string>();
        var errors = new List<string>();
        var parsedSections = new List<ParsedSection>();

        using var document = SpreadsheetDocument.Open(excelStream, false);
        var wbPart = document.WorkbookPart ?? throw new InvalidOperationException("El archivo Excel no contiene WorkbookPart.");
        var stringTable = wbPart.SharedStringTablePart?.SharedStringTable;

        var sheets = wbPart.Workbook?.Sheets?.Elements<Sheet>().ToList() ?? [];
        if (sheets.Count == 0)
        {
            errors.Add("El archivo Excel no contiene hojas de cálculo.");
            return new RosterDryRunReport
            {
                SectionsCount = 0,
                ValidStudentsCount = 0,
                IgnoredRowsCount = 0,
                NewStudentsCount = 0,
                HomonymsCount = 0,
                Warnings = warnings,
                Errors = errors,
                Sections = parsedSections
            };
        }

        var globalStudentOccurrences = new Dictionary<string, (string Sheet, string Grade, string Section, int Row)>(StringComparer.OrdinalIgnoreCase);
        var totalHomonyms = 0;
        var globalCounter = 0;

        foreach (var sheet in sheets)
        {
            var sheetName = sheet.Name?.Value ?? "HojaSinNombre";
            if (sheet.Id?.Value == null) continue;

            if (wbPart.GetPartById(sheet.Id.Value) is not WorksheetPart wsPart)
            {
                warnings.Add($"No se pudo acceder a la hoja '{sheetName}'.");
                continue;
            }

            var sheetData = wsPart.Worksheet?.Elements<SheetData>().FirstOrDefault();
            if (sheetData == null)
            {
                warnings.Add($"La hoja '{sheetName}' no contiene datos.");
                continue;
            }

            var rows = sheetData.Elements<Row>().OrderBy(r => r.RowIndex?.Value ?? 0).ToList();
            if (rows.Count == 0)
            {
                warnings.Add($"La hoja '{sheetName}' está vacía.");
                continue;
            }

            // 1. Extraer Grado y Sección
            var cellA1Val = GetCellText(rows[0], "A", stringTable);
            var (grade, sectionName) = DetermineGradeAndSection(sheetName, cellA1Val);

            // 2. Detectar fila de cabecera
            int headerRowIndex = -1;
            int headerRowOpenXmlIndex = -1;
            for (var i = 0; i < Math.Min(10, rows.Count); i++)
            {
                var r = rows[i];
                var colA = GetCellText(r, "A", stringTable).ToUpperInvariant();
                var colB = GetCellText(r, "B", stringTable).ToUpperInvariant();

                if (colA.Contains("N°") || colA.Contains("Nº") || colA.Contains("NUM") ||
                    colB.Contains("APELLIDOS") || colB.Contains("NOMBRE"))
                {
                    headerRowIndex = i;
                    headerRowOpenXmlIndex = (int)(r.RowIndex?.Value ?? (uint)(i + 1));
                    break;
                }
            }

            if (headerRowIndex == -1)
            {
                errors.Add($"No se detectó fila de cabecera (N° / APELLIDOS Y NOMBRES) en la hoja '{sheetName}'.");
                continue;
            }

            // 3. Procesar filas de alumnos
            var students = new List<ParsedStudent>();
            var ignoredRows = 0;
            var localSectionNames = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            for (var i = headerRowIndex + 1; i < rows.Count; i++)
            {
                var r = rows[i];
                var actualRowIndex = (int)(r.RowIndex?.Value ?? (uint)(i + 1));
                var colAText = GetCellText(r, "A", stringTable).Trim();
                var colBText = GetCellText(r, "B", stringTable).Trim();

                if (string.IsNullOrWhiteSpace(colBText))
                {
                    ignoredRows++;
                    continue;
                }

                // Limpiar espacios múltiples
                var cleanName = Regex.Replace(colBText, @"\s+", " ");
                var hasTwoCommas = false;

                // Validar formato de nombres y apellidos (sin exponer nombres reales en mensajes)
                var commaParts = cleanName.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                if (commaParts.Length == 3)
                {
                    var fixedName = $"{commaParts[0]} {commaParts[1]}, {commaParts[2]}";
                    warnings.Add($"Hoja '{sheetName}', Fila {actualRowIndex}: Formato con 2 comas normalizado automáticamente a formato estándar.");
                    cleanName = fixedName;
                    hasTwoCommas = true;
                }
                else if (commaParts.Length != 2)
                {
                    warnings.Add($"Hoja '{sheetName}', Fila {actualRowIndex}: Formato inusual de nombre (sin coma estándar de separación).");
                }

                int? orderNumber = int.TryParse(colAText, out var ord) ? ord : null;
                globalCounter++;
                var provCode = FormatStudentCode(globalCounter);

                var isHomonym = false;
                if (localSectionNames.TryGetValue(cleanName, out var prevRow))
                {
                    isHomonym = true;
                    totalHomonyms++;
                    warnings.Add($"⚠ POSIBLE HOMÓNIMO en hoja '{sheetName}' ({grade}° '{sectionName}'): coincidencia de nombres entre fila {prevRow} y fila {actualRowIndex}.");
                }
                else
                {
                    localSectionNames[cleanName] = actualRowIndex;
                }

                // Chequeo entre secciones
                if (globalStudentOccurrences.TryGetValue(cleanName, out var other))
                {
                    warnings.Add($"⚠ Posible coincidencia entre secciones: fila {actualRowIndex} en hoja '{sheetName}' coincide con fila {other.Row} en hoja '{other.Sheet}'.");
                }
                else
                {
                    globalStudentOccurrences[cleanName] = (sheetName, grade, sectionName, actualRowIndex);
                }

                students.Add(new ParsedStudent
                {
                    RowNumber = actualRowIndex,
                    OrderNumber = orderNumber,
                    RawFullName = colBText,
                    FullName = cleanName,
                    ProvisionalCode = provCode,
                    HasTwoCommasFormat = hasTwoCommas,
                    IsPossibleHomonym = isHomonym
                });
            }

            parsedSections.Add(new ParsedSection
            {
                SheetName = sheetName,
                Grade = grade,
                Name = sectionName,
                HeaderRow = headerRowOpenXmlIndex,
                Students = students,
                IgnoredRowsCount = ignoredRows
            });
        }

        var totalValid = parsedSections.Sum(s => s.Students.Count);
        var totalIgnored = parsedSections.Sum(s => s.IgnoredRowsCount);

        return new RosterDryRunReport
        {
            SectionsCount = parsedSections.Count,
            ValidStudentsCount = totalValid,
            IgnoredRowsCount = totalIgnored,
            NewStudentsCount = totalValid,
            HomonymsCount = totalHomonyms,
            Warnings = warnings,
            Errors = errors,
            Sections = parsedSections
        };
    }

    private static (string Grade, string Section) DetermineGradeAndSection(string sheetName, string cellA1)
    {
        if (!string.IsNullOrWhiteSpace(cellA1))
        {
            var matchA1 = GradeSectionRegex.Match(cellA1.Trim());
            if (matchA1.Success)
            {
                return (matchA1.Groups[1].Value, matchA1.Groups[2].Value.ToUpperInvariant());
            }
        }

        var matchSheet = GradeSectionRegex.Match(sheetName.Trim());
        if (matchSheet.Success)
        {
            return (matchSheet.Groups[1].Value, matchSheet.Groups[2].Value.ToUpperInvariant());
        }

        return ("?", sheetName.Trim());
    }

    private static string GetCellText(Row row, string colLetter, SharedStringTable? stringTable)
    {
        var cell = row.Elements<Cell>().FirstOrDefault(c =>
        {
            if (string.IsNullOrEmpty(c.CellReference?.Value)) return false;
            var match = ColLetterRegex.Match(c.CellReference.Value);
            return match.Success && match.Value.Equals(colLetter, StringComparison.OrdinalIgnoreCase);
        });

        if (cell == null) return string.Empty;

        if (cell.DataType != null && cell.DataType.Value == CellValues.SharedString)
        {
            if (int.TryParse(cell.InnerText, out var id) && stringTable != null)
            {
                var item = stringTable.ElementAtOrDefault(id);
                return item?.InnerText ?? string.Empty;
            }
        }

        return cell.CellValue?.Text ?? cell.InnerText ?? string.Empty;
    }
}
