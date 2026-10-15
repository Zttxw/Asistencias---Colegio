using System.Text.RegularExpressions;
using Asistencia.Api.Import;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Xunit;

namespace Asistencia.Tests;

public sealed class ExcelRosterParserTests
{
    [Fact]
    public void FormatStudentCode_ProducesFormattedSequentialCodes()
    {
        var code1 = ExcelRosterParser.FormatStudentCode(1);
        var code2 = ExcelRosterParser.FormatStudentCode(42);

        Assert.Equal("STU-0001", code1);
        Assert.Equal("STU-0042", code2);
    }

    [Fact]
    public void Analyze_SyntheticDirectList_ParsesSuccessfully()
    {
        // Hoja tipo 1A: Fila 1 = cabecera directa, Fila 2+ = alumnos
        var excelBytes = CreateSyntheticExcel(
            new SyntheticSheet("1A", null, new[]
            {
                new[] { "N°", "APELLIDOS Y NOMBRES" },
                new[] { "1", "GOMEZ DIAZ, CARLOS" },
                new[] { "2", "LOPEZ ROJAS, ANA" },
                new[] { "3", "MENDOZA FLORES, LUIS" }
            })
        );

        using var ms = new MemoryStream(excelBytes);
        var report = ExcelRosterParser.Analyze(ms);

        Assert.Equal(1, report.SectionsCount);
        Assert.Equal(3, report.ValidStudentsCount);
        Assert.Equal(0, report.IgnoredRowsCount);
        Assert.Equal(0, report.HomonymsCount);
        Assert.Empty(report.Errors);

        var section = report.Sections[0];
        Assert.Equal("1", section.Grade);
        Assert.Equal("A", section.Name);
        Assert.Equal(3, section.Students.Count);
        Assert.Equal("GOMEZ DIAZ, CARLOS", section.Students[0].FullName);
        Assert.Equal(1, section.Students[0].OrderNumber);
    }

    [Fact]
    public void Analyze_SyntheticMonthlyRegisterFormat_IgnoresEmptyRowsAndDetectsBanner()
    {
        // Hoja tipo 4A (2): Fila 1 = Banner 4 "A", Fila 2 = Días, Fila 3 = Cabecera, Filas 4-5 = alumnos, Fila 6 = orden sin nombre
        var excelBytes = CreateSyntheticExcel(
            new SyntheticSheet("4A (2)", "4 \"A\"", new[]
            {
                new[] { "4 \"A\"", "MES DE OCTUBRE 2026" },
                new[] { "", "1", "2", "3" },
                new[] { "N°", "APELLIDOS Y NOMBRES" },
                new[] { "1", "QUISPE MAMANI, CESAR" },
                new[] { "2", "MENDOZA ROJAS, FANY" },
                new[] { "3", "" } // Fila vacía / con solo número de orden
            })
        );

        using var ms = new MemoryStream(excelBytes);
        var report = ExcelRosterParser.Analyze(ms);

        Assert.Equal(1, report.SectionsCount);
        Assert.Equal(2, report.ValidStudentsCount);
        Assert.Equal(1, report.IgnoredRowsCount);
        Assert.Equal(0, report.HomonymsCount);
        Assert.Empty(report.Errors);

        var sec = report.Sections[0];
        Assert.Equal("4", sec.Grade);
        Assert.Equal("A", sec.Name);
        Assert.Equal(2, sec.Students.Count);
    }

    [Fact]
    public void Analyze_HomonymInSameSection_FlagsWarningAndPossibleHomonym()
    {
        var excelBytes = CreateSyntheticExcel(
            new SyntheticSheet("5B", "5 \"B\"", new[]
            {
                new[] { "5 \"B\"", "" },
                new[] { "N°", "APELLIDOS Y NOMBRES" },
                new[] { "1", "PEREZ GOMEZ, JUAN" },
                new[] { "2", "PEREZ GOMEZ, JUAN" } // Homónimo idéntico
            })
        );

        using var ms = new MemoryStream(excelBytes);
        var report = ExcelRosterParser.Analyze(ms);

        Assert.Equal(1, report.HomonymsCount);
        Assert.Contains(report.Warnings, w => w.Contains("POSIBLE HOMÓNIMO"));
        Assert.True(report.Sections[0].Students[1].IsPossibleHomonym);
    }

    [Fact]
    public void Analyze_TwoCommasFormat_AutoCorrectsWithWarning()
    {
        var excelBytes = CreateSyntheticExcel(
            new SyntheticSheet("5C", "5 \"C\"", new[]
            {
                new[] { "5 \"C\"", "" },
                new[] { "N°", "APELLIDOS Y NOMBRES" },
                new[] { "1", "ALVAREZ, CASTILLO, ANA PAULA" }
            })
        );

        using var ms = new MemoryStream(excelBytes);
        var report = ExcelRosterParser.Analyze(ms);

        Assert.Equal(1, report.ValidStudentsCount);
        var student = report.Sections[0].Students[0];
        Assert.Equal("ALVAREZ CASTILLO, ANA PAULA", student.FullName);
        Assert.True(student.HasTwoCommasFormat);
        Assert.Contains(report.Warnings, w => w.Contains("Formato con 2 comas normalizado"));
    }

    private sealed record SyntheticSheet(string SheetName, string? CellA1, string[][] Rows);

    private static byte[] CreateSyntheticExcel(params SyntheticSheet[] sheets)
    {
        using var ms = new MemoryStream();
        using (var document = SpreadsheetDocument.Create(ms, SpreadsheetDocumentType.Workbook))
        {
            var wbPart = document.AddWorkbookPart();
            wbPart.Workbook = new Workbook();
            var sheetsElement = wbPart.Workbook.AppendChild(new Sheets());

            uint sheetId = 1;
            foreach (var sheetDef in sheets)
            {
                var wsPart = wbPart.AddNewPart<WorksheetPart>();
                var sheetData = new SheetData();
                wsPart.Worksheet = new Worksheet(sheetData);

                var relId = wbPart.GetIdOfPart(wsPart);
                var sheet = new Sheet
                {
                    Id = relId,
                    SheetId = sheetId++,
                    Name = sheetDef.SheetName
                };
                sheetsElement.Append(sheet);

                for (var rIdx = 0; rIdx < sheetDef.Rows.Length; rIdx++)
                {
                    var rowData = sheetDef.Rows[rIdx];
                    var rowElem = new Row { RowIndex = (uint)(rIdx + 1) };
                    sheetData.Append(rowElem);

                    for (var cIdx = 0; cIdx < rowData.Length; cIdx++)
                    {
                        var colLetter = GetColumnLetter(cIdx + 1);
                        var cellVal = rowData[cIdx];
                        if (rIdx == 0 && cIdx == 0 && sheetDef.CellA1 != null)
                            cellVal = sheetDef.CellA1;

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

    private static string GetColumnLetter(int columnNumber)
    {
        var dividend = columnNumber;
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
