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

app.Run();

/// <summary>Expuesto para pruebas de integración (WebApplicationFactory).</summary>
public partial class Program;
