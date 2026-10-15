using System.Collections.Concurrent;

namespace Asistencia.Api.Auth;

/// <summary>
/// Protección contra ataques de fuerza bruta en login (Punto 8).
/// Política: 5 intentos fallidos consecutivos bloquean la cuenta temporalmente por 5 minutos.
/// Un login exitoso restablece el contador de fallos.
/// </summary>
public sealed class LoginLockoutTracker
{
    private readonly ConcurrentDictionary<string, (int FailedCount, DateTimeOffset? LockoutEnd)> _attempts = new();
    public const int MaxFailedAttempts = 5;
    public static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(5);

    public (bool IsLocked, TimeSpan? Remaining) CheckLockout(string username)
    {
        if (string.IsNullOrWhiteSpace(username)) return (false, null);

        var key = username.Trim().ToLowerInvariant();
        if (_attempts.TryGetValue(key, out var state) && state.LockoutEnd.HasValue)
        {
            var now = DateTimeOffset.UtcNow;
            if (now < state.LockoutEnd.Value)
            {
                return (true, state.LockoutEnd.Value - now);
            }
            // Bloqueo expirado; limpiar el estado expirado
            _attempts.TryUpdate(key, (0, null), state);
        }
        return (false, null);
    }

    public (bool NowLocked, TimeSpan? Remaining) RecordFailure(string username)
    {
        if (string.IsNullOrWhiteSpace(username)) return (false, null);

        var key = username.Trim().ToLowerInvariant();
        var now = DateTimeOffset.UtcNow;

        var updated = _attempts.AddOrUpdate(key,
            _ => (1, null),
            (_, current) =>
            {
                var newCount = current.FailedCount + 1;
                if (newCount >= MaxFailedAttempts)
                {
                    return (newCount, now.Add(LockoutDuration));
                }
                return (newCount, null);
            });

        if (updated.LockoutEnd.HasValue && updated.LockoutEnd.Value > now)
        {
            return (true, updated.LockoutEnd.Value - now);
        }
        return (false, null);
    }

    public void RecordSuccess(string username)
    {
        if (string.IsNullOrWhiteSpace(username)) return;
        _attempts.TryRemove(username.Trim().ToLowerInvariant(), out _);
    }

    public void Reset()
    {
        _attempts.Clear();
    }
}
