using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Asistencia.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Tests;

/// <summary>
/// D8 / DEC-007: el contador transaccional serializa a los escritores y el orden de
/// los server_change_id coincide con el orden de commit.
/// </summary>
public sealed class ChangeLogWriterTests(PostgresFixture fx) : IClassFixture<PostgresFixture>
{
    [Fact]
    public async Task Record_WithoutExplicitTransaction_Throws()
    {
        await using var db = fx.CreateContext();
        var writer = new ChangeLogWriter(db);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            writer.RecordAsync(EntityNames.Student, Guid.NewGuid(), ChangeOperation.Insert));
    }

    [Fact]
    public async Task RolledBackTransaction_DoesNotConsumeIds()
    {
        long before;
        await using (var db = fx.CreateContext())
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var writer = new ChangeLogWriter(db);
            before = await writer.LockAsync();
            await writer.RecordAsync(EntityNames.Student, Guid.NewGuid(), ChangeOperation.Insert);
            await db.SaveChangesAsync();
            await tx.RollbackAsync();
        }

        await using var check = fx.CreateContext();
        Assert.Equal(before, (await check.SyncCursor.AsNoTracking().SingleAsync()).Value);
        Assert.False(await check.ChangeLog.AnyAsync(c => c.ServerChangeId > before));
    }

    [Fact]
    public async Task ConcurrentWriters_AreSerialized_IdsFollowCommitOrder_AndReaderNeverSeesGaps()
    {
        await using var db1 = fx.CreateContext();
        await using var db2 = fx.CreateContext();

        // T1 toma el bloqueo y registra un cambio, pero aún no confirma.
        await using var tx1 = await db1.Database.BeginTransactionAsync();
        var w1 = new ChangeLogWriter(db1);
        await w1.LockAsync();
        var id1 = await w1.RecordAsync(EntityNames.Student, Guid.NewGuid(), ChangeOperation.Insert);
        await db1.SaveChangesAsync();

        // T2 intenta escribir: debe quedar bloqueado hasta el COMMIT de T1.
        var t2 = Task.Run(async () =>
        {
            await using var tx2 = await db2.Database.BeginTransactionAsync();
            var w2 = new ChangeLogWriter(db2);
            await w2.LockAsync();
            var id = await w2.RecordAsync(EntityNames.Student, Guid.NewGuid(), ChangeOperation.Insert);
            await db2.SaveChangesAsync();
            await tx2.CommitAsync();
            return id;
        });

        await Task.Delay(500);
        Assert.False(t2.IsCompleted, "T2 debería esperar el bloqueo de sync_cursor que mantiene T1.");

        // Un lector con cursor intermedio no ve nada aún (nada confirmado por encima de id1 - 1).
        await using (var reader = fx.CreateContext())
            Assert.False(await reader.ChangeLog.AnyAsync(c => c.ServerChangeId >= id1));

        await tx1.CommitAsync();
        var id2 = await t2.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.Equal(id1 + 1, id2);

        // Tras ambos commits, la bajada desde id1 - 1 ve ambos cambios, en orden y sin huecos.
        await using var check = fx.CreateContext();
        var seen = await check.ChangeLog.Where(c => c.ServerChangeId > id1 - 1)
            .OrderBy(c => c.ServerChangeId).Select(c => c.ServerChangeId).ToListAsync();
        Assert.Equal([id1, id2], seen);
    }
}
