using Asistencia.Api.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Asistencia.Tests.Infrastructure;

/// <summary>
/// Crea una base PostgreSQL real y temporal por clase de prueba, aplica las migraciones
/// y la elimina al terminar (DEC-009). Nunca InMemory/SQLite: los índices únicos,
/// los índices parciales y los bloqueos deben probarse contra PostgreSQL.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly string _adminConnectionString;
    public string ConnectionString { get; }
    public string DatabaseName { get; }

    public PostgresFixture()
    {
        var baseCs = Environment.GetEnvironmentVariable("TEST_DATABASE_URL")
                     ?? "Host=localhost;Port=5433;Username=asistencia;Password=asistencia_dev;Database=postgres";
        var admin = new NpgsqlConnectionStringBuilder(baseCs) { Pooling = false };
        _adminConnectionString = admin.ConnectionString;

        DatabaseName = $"asistencia_test_{Guid.NewGuid():N}";
        ConnectionString = new NpgsqlConnectionStringBuilder(baseCs) { Database = DatabaseName }.ConnectionString;
    }

    public AppDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(ConnectionString).Options);

    public async Task InitializeAsync()
    {
        await using (var conn = new NpgsqlConnection(_adminConnectionString))
        {
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand($"CREATE DATABASE \"{DatabaseName}\"", conn);
            await cmd.ExecuteNonQueryAsync();
        }

        await using var db = CreateContext();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        await using var conn = new NpgsqlConnection(_adminConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{DatabaseName}\" WITH (FORCE)", conn);
        await cmd.ExecuteNonQueryAsync();
    }
}
