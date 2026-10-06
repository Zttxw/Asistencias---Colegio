using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Asistencia.Tests.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Tests;

/// <summary>Seed ficticio: 1 institución, 1 docente, 1 sección, 30 alumnos, todo en change_log.</summary>
public sealed class SeedTests(PostgresFixture fx) : IClassFixture<PostgresFixture>
{
    private static readonly SeedOptions Options = new() { Enabled = true, TeacherPassword = "clave-de-prueba" };

    private static Seeder NewSeeder(AppDbContext db) => new(db, new ChangeLogWriter(db), new PasswordHasher<User>());

    [Fact]
    public async Task Seed_CreatesPilotData_RegistersChanges_AndIsIdempotent()
    {
        // La base es compartida por la clase y el orden de los tests no está garantizado:
        // el primer seed puede haber ocurrido en otro test.
        await using (var db = fx.CreateContext())
            await NewSeeder(db).SeedAsync(Options);

        await using (var db = fx.CreateContext())
            Assert.False(await NewSeeder(db).SeedAsync(Options)); // segunda vez: no hace nada

        await using var check = fx.CreateContext();
        Assert.Equal(1, await check.Institutions.CountAsync());
        Assert.Equal(1, await check.Teachers.CountAsync());
        Assert.Equal(1, await check.Sections.CountAsync());
        Assert.Equal(1, await check.SectionTeachers.CountAsync());
        Assert.Equal(30, await check.Students.CountAsync());
        Assert.Equal(30, await check.Enrollments.CountAsync(e => e.Status == EnrollmentStatus.Active));

        // Todo lo descargable está en change_log: 1 año + 1 sección + 1 vínculo + 30 alumnos + 30 matrículas.
        var ids = await check.ChangeLog.OrderBy(c => c.ServerChangeId).Select(c => c.ServerChangeId).ToListAsync();
        Assert.Equal(63, ids.Count);
        Assert.Equal(Enumerable.Range(1, 63).Select(i => (long)i), ids); // contiguos, sin huecos
        Assert.Equal(63, (await check.SyncCursor.SingleAsync()).Value);
        Assert.Equal(30, await check.ChangeLog.CountAsync(c => c.Entity == EntityNames.Student));

        // Timestamps del servidor asignados.
        Assert.All(await check.Students.ToListAsync(), s => Assert.NotEqual(default, s.CreatedAt));
    }

    [Fact]
    public async Task Seed_StoresHashedPassword_NeverPlainText()
    {
        await using (var db = fx.CreateContext())
            await NewSeeder(db).SeedAsync(Options);

        await using var check = fx.CreateContext();
        var user = await check.Users.SingleAsync();
        Assert.NotEqual(Options.TeacherPassword, user.PasswordHash);
        Assert.Equal(UserRole.Teacher, user.Role);
        Assert.NotEqual(PasswordVerificationResult.Failed,
            new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, Options.TeacherPassword));
    }

    [Fact]
    public async Task Seed_WithoutPassword_FailsClearly()
    {
        await using var db = fx.CreateContext();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            NewSeeder(db).SeedAsync(new SeedOptions { Enabled = true, TeacherPassword = "" }));
    }
}
