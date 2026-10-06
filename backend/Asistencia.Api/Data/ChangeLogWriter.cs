using Asistencia.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Api.Data;

/// <summary>
/// Único punto de escritura de change_log (D8, DEC-006, DEC-007). Lo usan el seed,
/// la importación y la sincronización.
///
/// Uso obligatorio dentro de una transacción explícita:
/// <code>
/// await using var tx = await db.Database.BeginTransactionAsync();
/// await changes.LockAsync();                    // 1) primero el bloqueo (evita deadlocks)
/// ... validar y modificar entidades ...
/// entity.ServerChangeId = await changes.RecordAsync(EntityNames.X, entity.Id, ChangeOperation.Insert);
/// await db.SaveChangesAsync();
/// await tx.CommitAsync();                       // libera el bloqueo de sync_cursor
/// </code>
/// El bloqueo de fila sobre sync_cursor se mantiene hasta el COMMIT, de modo que el orden de
/// commit coincide con el orden de los server_change_id y la bajada por cursor no pierde cambios.
/// </summary>
public sealed class ChangeLogWriter(AppDbContext db)
{
    /// <summary>
    /// Toma el bloqueo de fila de sync_cursor al inicio de la transacción y devuelve el valor actual.
    /// Serializa a todos los escritores desde el principio (DEC-007).
    /// </summary>
    public async Task<long> LockAsync(CancellationToken ct = default)
    {
        EnsureTransaction();
        var rows = await db.Database
            .SqlQueryRaw<long>("SELECT value AS \"Value\" FROM sync_cursor WHERE id = 1 FOR UPDATE")
            .ToListAsync(ct);
        return rows.Single();
    }

    /// <summary>
    /// Incrementa sync_cursor (UPDATE ... RETURNING) y agrega la fila de change_log al contexto.
    /// El llamador debe hacer SaveChanges y Commit en la misma transacción.
    /// </summary>
    public async Task<long> RecordAsync(string entity, Guid entityId, ChangeOperation operation,
        string? previousStatus = null, CancellationToken ct = default)
    {
        EnsureTransaction();
        // ToListAsync (no SingleAsync) para que EF no envuelva el UPDATE en una subconsulta.
        var rows = await db.Database
            .SqlQueryRaw<long>("UPDATE sync_cursor SET value = value + 1 WHERE id = 1 RETURNING value AS \"Value\"")
            .ToListAsync(ct);
        var id = rows.Single();

        db.ChangeLog.Add(new ChangeLogEntry
        {
            ServerChangeId = id,
            Entity = entity,
            EntityId = entityId,
            Operation = operation,
            PreviousStatus = previousStatus,
        });
        return id;
    }

    private void EnsureTransaction()
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException(
                "ChangeLogWriter requiere una transacción explícita (BeginTransactionAsync) para garantizar el orden de commit.");
    }
}
