using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAsistenciaData(builder.Configuration);

var app = builder.Build();

// HTTPS se termina fuera de Kestrel (tailscale serve / Caddy): sin UseHttpsRedirection (D12).

await app.InitializeDatabaseAsync();

var api = app.MapGroup("/api");

// Salud del servicio + hora del servidor (la tablet la usará para corregir su reloj; revisión B3).
api.MapGet("/health", async (AppDbContext db, CancellationToken ct) =>
{
    var dbOk = await db.Database.CanConnectAsync(ct);
    var cursor = dbOk ? await db.SyncCursor.Where(c => c.Id == 1).Select(c => c.Value).FirstOrDefaultAsync(ct) : (long?)null;
    var body = new
    {
        status = dbOk ? "ok" : "degraded",
        serverTime = DateTimeOffset.UtcNow,
        serverDate = LimaClock.Today(),
        serverCursor = cursor,
    };
    return dbOk ? Results.Ok(body) : Results.Json(body, statusCode: StatusCodes.Status503ServiceUnavailable);
});

// Bootstrap para inicializar datos base del piloto en la tablet (docente, sección y alumnos)
api.MapGet("/bootstrap", async (AppDbContext db, CancellationToken ct) =>
{
    var teacher = await db.Teachers.Include(t => t.User).FirstOrDefaultAsync(ct);
    var section = await db.Sections.FirstOrDefaultAsync(ct);
    var student = await db.Students.FirstOrDefaultAsync(ct);

    if (teacher is null || section is null || student is null)
        return Results.NotFound(new { error = "No hay datos semilla en el servidor" });

    return Results.Ok(new
    {
        teacherId = teacher.Id,
        teacherName = teacher.FullName,
        sectionId = section.Id,
        sectionName = $"{section.Grade} \"{section.Name}\"",
        studentId = student.Id,
        studentName = student.FullName,
        studentCode = student.Code,
        serverDate = LimaClock.Today()
    });
});

// Protocolo de sincronización: subida
api.MapPost("/sync", async (Asistencia.Api.Sync.SyncPushRequest request,
                            Asistencia.Api.Sync.SyncProcessor processor,
                            AppDbContext db,
                            CancellationToken ct) =>
{
    // En la Fase 2 vertical slice tomamos el usuario docente registrado en seed/BD (el JWT completo entra en Fase 3/4)
    var user = await db.Users.FirstOrDefaultAsync(u => u.Role == UserRole.Teacher, ct)
               ?? await db.Users.FirstAsync(ct);
    var response = await processor.ProcessPushAsync(request, user.Id, ct);
    return Results.Ok(response);
});

// Protocolo de sincronización: bajada
api.MapGet("/sync/changes", async (long cursor,
                                   int? limit,
                                   Asistencia.Api.Sync.SyncQueryService queryService,
                                   CancellationToken ct) =>
{
    var response = await queryService.GetChangesAsync(cursor, limit ?? 100, ct);
    return Results.Ok(response);
});

app.Run();

/// <summary>Expuesto para pruebas de integración (WebApplicationFactory).</summary>
public partial class Program;
