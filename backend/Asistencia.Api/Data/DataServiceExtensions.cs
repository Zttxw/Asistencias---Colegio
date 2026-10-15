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
        services.AddScoped<Import.RosterImporter>();
        services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddSingleton<Auth.JwtTokenService>();
        services.AddSingleton<Auth.LoginLockoutTracker>();
        services.AddScoped<Auth.AuthService>();
        services.Configure<SeedOptions>(config.GetSection("Seed"));
        return services;
    }

    /// <summary>Aplica migraciones (DEC-008) y siembra datos si corresponde (DEC-006).</summary>
    public static Task InitializeDatabaseAsync(this WebApplication app) =>
        InitializeDatabaseAsync(app.Services, app.Configuration);

    public static async Task InitializeDatabaseAsync(IServiceProvider services, IConfiguration config)
    {
        using var scope = services.CreateScope();
        var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Database");
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (config.GetValue("Database:MigrateOnStartup", false))
        {
            log.LogInformation("Aplicando migraciones...");
            await db.Database.MigrateAsync();
        }

        var seedDemoRaw = Environment.GetEnvironmentVariable("SEED_DEMO")
                          ?? config.GetValue<string>("SEED_DEMO");
        var isSeedDemo = string.Equals(seedDemoRaw, "true", StringComparison.OrdinalIgnoreCase);

        if (isSeedDemo)
        {
            var seed = config.GetSection("Seed").Get<SeedOptions>() ?? new SeedOptions();
            seed.Enabled = true;
            if (string.IsNullOrWhiteSpace(seed.TeacherPassword))
            {
                seed.TeacherPassword = Environment.GetEnvironmentVariable("SEED_TEACHER_PASSWORD")
                                       ?? "clave-docente-segura-123";
            }
            var seeded = await scope.ServiceProvider.GetRequiredService<Seeder>().SeedAsync(seed);
            log.LogInformation(seeded ? "Datos semilla de demostración creados (SEED_DEMO=true)." : "La base ya tenía datos; seed omitido.");
        }
        else
        {
            log.LogInformation("SEED_DEMO no activo (false o no definido); seed de demostración omitido.");
        }
    }
}
