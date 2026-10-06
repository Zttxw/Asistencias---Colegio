using Asistencia.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Api.Data;

public static class DataServiceExtensions
{
    /// <summary>Registra EF Core + Npgsql y los servicios de datos.</summary>
    public static IServiceCollection AddAsistenciaData(this IServiceCollection services, IConfiguration config)
    {
        var cs = config.GetConnectionString("Default")
                 ?? throw new InvalidOperationException("Falta ConnectionStrings__Default.");

        // Sin EnableRetryOnFailure: las transacciones explícitas de ChangeLogWriter no son
        // compatibles con la estrategia de reintentos sin envolverlas (ver revisión I2).
        services.AddDbContext<AppDbContext>(o => o.UseNpgsql(cs));
        services.AddScoped<ChangeLogWriter>();
        services.AddScoped<Seeder>();
        services.AddScoped<Sync.SyncProcessor>();
        services.AddScoped<Sync.SyncQueryService>();
        services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        services.Configure<SeedOptions>(config.GetSection("Seed"));
        return services;
    }

    /// <summary>Aplica migraciones (DEC-008) y siembra datos si corresponde (DEC-006).</summary>
    public static async Task InitializeDatabaseAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var config = app.Configuration;
        var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Database");
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (config.GetValue("Database:MigrateOnStartup", false))
        {
            log.LogInformation("Aplicando migraciones...");
            await db.Database.MigrateAsync();
        }

        var seed = config.GetSection("Seed").Get<SeedOptions>() ?? new SeedOptions();
        if (seed.Enabled)
        {
            var seeded = await scope.ServiceProvider.GetRequiredService<Seeder>().SeedAsync(seed);
            log.LogInformation(seeded ? "Datos semilla creados." : "La base ya tenía datos; seed omitido.");
        }
    }
}
