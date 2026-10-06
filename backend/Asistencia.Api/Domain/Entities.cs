namespace Asistencia.Api.Domain;

// Entidades del modelo (plan v3.2, sección 5 + enmiendas DEC-003).
// Los valores marcados [PROVISIONAL] dependen del Excel real del docente (Fase 0).

/// <summary>Entidad con marcas de tiempo asignadas por el servidor (UTC).</summary>
public interface ITimestamped
{
    DateTime CreatedAt { get; set; }
    DateTime UpdatedAt { get; set; }
}

public enum UserRole { Teacher, Auxiliary, Admin }

public enum EnrollmentStatus { Active, Withdrawn }

public enum SessionStatus { Open, Taken, Void }

/// <summary>[PROVISIONAL] Estados de asistencia; ajustar según el Excel real.</summary>
public enum AttendanceStatus { Present, Absent, Late, Excused }

public enum ChangeOperation { Insert, Update }

/// <summary>Nombres de entidad usados en change_log y en el protocolo de sincronización.</summary>
public static class EntityNames
{
    public const string AcademicYear = "academic_year";
    public const string Section = "section";
    public const string SectionTeacher = "section_teacher";
    public const string Student = "student";
    public const string Enrollment = "enrollment";
    public const string ClassSession = "class_session";
    public const string AttendanceRecord = "attendance_record";
    public const string NonSchoolDay = "non_school_day";
}

public class Institution : ITimestamped
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class User : ITimestamped
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Institution? Institution { get; set; }
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public UserRole Role { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Teacher : ITimestamped
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public string FullName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class AcademicYear : ITimestamped
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Institution? Institution { get; set; }
    public int Year { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>[PROVISIONAL] Grado y nombre de sección según el Excel.</summary>
public class Section : ITimestamped
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Institution? Institution { get; set; }
    public Guid AcademicYearId { get; set; }
    public AcademicYear? AcademicYear { get; set; }
    public string Grade { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Relación docente ↔ sección (revisión I4).</summary>
public class SectionTeacher : ITimestamped
{
    public Guid Id { get; set; }
    public Guid SectionId { get; set; }
    public Section? Section { get; set; }
    public Guid TeacherId { get; set; }
    public Teacher? Teacher { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Datos mínimos del menor: sin DNI, dirección, datos médicos ni familiares.</summary>
public class Student : ITimestamped
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Institution? Institution { get; set; }
    public string Code { get; set; } = "";
    public string FullName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Enrollment : ITimestamped
{
    public Guid Id { get; set; }
    public Guid StudentId { get; set; }
    public Student? Student { get; set; }
    public Guid SectionId { get; set; }
    public Section? Section { get; set; }
    public Guid AcademicYearId { get; set; }
    public AcademicYear? AcademicYear { get; set; }
    public EnrollmentStatus Status { get; set; } = EnrollmentStatus.Active;
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Device : ITimestamped
{
    /// <summary>UUID generado por la tablet.</summary>
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public string Name { get; set; } = "";
    public DateTime? LastSyncAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Entidad sincronizable: id generado en la tablet y control de versión numérico (D4, D7).</summary>
public interface ISyncEntity : ITimestamped
{
    Guid Id { get; set; }
    int Version { get; set; }
    /// <summary>Informativo; la fuente oficial del cursor es change_log.</summary>
    long ServerChangeId { get; set; }
    /// <summary>Último dispositivo que escribió el registro.</summary>
    Guid? DeviceId { get; set; }
    /// <summary>baseVersion desde la que empezó la cadena de escrituras del último dispositivo (revisión I1).</summary>
    int ChainBaseVersion { get; set; }
    /// <summary>Solo informativo: nunca decide qué dato es más nuevo.</summary>
    DateTimeOffset? ClientUpdatedAt { get; set; }
}

public class ClassSession : ISyncEntity
{
    public Guid Id { get; set; }
    public Guid SectionId { get; set; }
    public Section? Section { get; set; }
    public Guid TeacherId { get; set; }
    public Teacher? Teacher { get; set; }
    public DateOnly Date { get; set; }
    /// <summary>[PROVISIONAL] "JORNADA" si se pasa lista una vez al día.</summary>
    public string Slot { get; set; } = DefaultSlot;
    public string? CourseName { get; set; }
    public SessionStatus Status { get; set; } = SessionStatus.Open;
    public int Version { get; set; } = 1;
    public long ServerChangeId { get; set; }
    public Guid? DeviceId { get; set; }
    public Device? Device { get; set; }
    public int ChainBaseVersion { get; set; }
    public DateTimeOffset? ClientUpdatedAt { get; set; }
    public DateTime? VoidedAt { get; set; }
    public Guid? VoidedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public const string DefaultSlot = "JORNADA";
}

public class AttendanceRecord : ISyncEntity
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public ClassSession? Session { get; set; }
    public Guid StudentId { get; set; }
    public Student? Student { get; set; }
    public AttendanceStatus Status { get; set; }
    public string? Note { get; set; }
    public int Version { get; set; } = 1;
    public long ServerChangeId { get; set; }
    public Guid? DeviceId { get; set; }
    public Device? Device { get; set; }
    public int ChainBaseVersion { get; set; }
    public DateTimeOffset? ClientUpdatedAt { get; set; }
    public bool IsVoid { get; set; }
    public DateTime? VoidedAt { get; set; }
    public Guid? VoidedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>[PROVISIONAL] Feriados y días sin clases.</summary>
public class NonSchoolDay : ITimestamped
{
    public Guid Id { get; set; }
    public Guid InstitutionId { get; set; }
    public Institution? Institution { get; set; }
    public DateOnly Date { get; set; }
    public string Reason { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Fuente del cursor de bajada. server_change_id se toma de sync_cursor dentro de la misma
/// transacción del cambio (D8). No guarda el objeto completo, solo qué entidad cambió.
/// </summary>
public class ChangeLogEntry
{
    public long ServerChangeId { get; set; }
    public string Entity { get; set; } = "";
    public Guid EntityId { get; set; }
    public ChangeOperation Operation { get; set; }
    /// <summary>Estado anterior (opcional) para métricas de corrección / auditoría futura.</summary>
    public string? PreviousStatus { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Contador transaccional de una sola fila (id = 1).</summary>
public class SyncCursor
{
    public int Id { get; set; }
    public long Value { get; set; }
}
