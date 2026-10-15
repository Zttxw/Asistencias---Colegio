using Asistencia.Api.Data;
using Asistencia.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Asistencia.Tests;

/// <summary>
/// Pruebas del arranque condicional según variable SEED_DEMO (Requisito 5).
/// Comprueba que sin SEED_DEMO no se inserta ningún dato demo ni change_log,
/// y con SEED_DEMO=true se ejecuta la siembra correctamente.
/// </summary>
public sealed class SeedDemoStartupTests(PostgresFixture fx) : IClassFixture<PostgresFixture>
{
    private static async Task CleanDbAsync(AppDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync(@"
            TRUNCATE TABLE attendance_records, class_sessions, enrollments,
                           section_teachers, students, sections, academic_years,
                           users, teachers, institutions, change_log, devices
            CASCADE;
            UPDATE sync_cursor SET value = 0 WHERE id = 1;
        ");
    }

    [Fact]
    public async Task Startup_WithoutSeedDemo_DoesNotInsertDemoData()
    {
        await using (var db = fx.CreateContext())
        {
            await CleanDbAsync(db);
        }

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = fx.ConnectionString,
                ["SEED_DEMO"] = "false",
                ["Seed:TeacherPassword"] = "clave-docente-segura-123"
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAsistenciaData(config);
        using var sp = services.BuildServiceProvider();

        await DataServiceExtensions.InitializeDatabaseAsync(sp, config);

        await using var check = fx.CreateContext();
        Assert.Equal(0, await check.Students.CountAsync());
        Assert.Equal(0, await check.Sections.CountAsync());
        Assert.Equal(0, await check.ChangeLog.CountAsync());
    }

    [Fact]
    public async Task Startup_WithSeedDemoTrue_InsertsDemoData()
    {
        await using (var db = fx.CreateContext())
        {
            await CleanDbAsync(db);
        }

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = fx.ConnectionString,
                ["SEED_DEMO"] = "true",
                ["Seed:TeacherPassword"] = "clave-docente-segura-123"
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAsistenciaData(config);
        using var sp = services.BuildServiceProvider();

        await DataServiceExtensions.InitializeDatabaseAsync(sp, config);

        await using var check = fx.CreateContext();
        Assert.Equal(30, await check.Students.CountAsync());
        Assert.Equal(1, await check.Sections.CountAsync());
        Assert.Equal(63, await check.ChangeLog.CountAsync());
    }
}
