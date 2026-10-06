namespace Asistencia.Api.Domain;

/// <summary>
/// Reloj de negocio del servidor en America/Lima (DEC-010). La fecha "hoy" de una sesión
/// se calcula en Lima, no en UTC (después de las 19:00 de Lima ya es otro día en UTC).
/// </summary>
public static class LimaClock
{
    // Perú no usa horario de verano desde 1994; el offset fijo sirve de respaldo si falta tzdata.
    private static readonly TimeZoneInfo Zone = Resolve();

    private static TimeZoneInfo Resolve()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/Lima"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.CreateCustomTimeZone("Lima", TimeSpan.FromHours(-5), "Lima", "Lima"); }
    }

    public static DateTimeOffset Now(DateTimeOffset? utcNow = null) =>
        TimeZoneInfo.ConvertTime(utcNow ?? DateTimeOffset.UtcNow, Zone);

    public static DateOnly Today(DateTimeOffset? utcNow = null) => DateOnly.FromDateTime(Now(utcNow).DateTime);
}
