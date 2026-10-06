using System.Text;
using Asistencia.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Asistencia.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Institution> Institutions => Set<Institution>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Teacher> Teachers => Set<Teacher>();
    public DbSet<AcademicYear> AcademicYears => Set<AcademicYear>();
    public DbSet<Section> Sections => Set<Section>();
    public DbSet<SectionTeacher> SectionTeachers => Set<SectionTeacher>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<Enrollment> Enrollments => Set<Enrollment>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<ClassSession> ClassSessions => Set<ClassSession>();
    public DbSet<AttendanceRecord> AttendanceRecords => Set<AttendanceRecord>();
    public DbSet<NonSchoolDay> NonSchoolDays => Set<NonSchoolDay>();
    public DbSet<ChangeLogEntry> ChangeLog => Set<ChangeLogEntry>();
    public DbSet<SyncCursor> SyncCursor => Set<SyncCursor>();

    // Nombres de restricciones usados por el código de sincronización y por los tests.
    public const string UxAttendanceSessionStudent = "ux_attendance_records_session_student";
    public const string UxSessionSectionDateSlot = "ux_class_sessions_section_date_slot";
    public const string UxEnrollmentActivePerYear = "ux_enrollments_student_year_active";

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Institution>(e =>
        {
            e.ToTable("institutions");
            e.Property(x => x.Name).HasMaxLength(200);
        });

        b.Entity<User>(e =>
        {
            e.ToTable("users", t => t.HasCheckConstraint("ck_users_role", In<UserRole>("role")));
            e.Property(x => x.Username).HasMaxLength(100);
            e.HasIndex(x => x.Username).IsUnique();
            e.Property(x => x.Role).HasConversion(new UpperEnumConverter<UserRole>()).HasMaxLength(20);
            e.HasOne(x => x.Institution).WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Teacher>(e =>
        {
            e.ToTable("teachers");
            e.Property(x => x.FullName).HasMaxLength(200);
            e.HasIndex(x => x.UserId).IsUnique();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<AcademicYear>(e =>
        {
            e.ToTable("academic_years", t => t.HasCheckConstraint("ck_academic_years_dates", "end_date >= start_date"));
            e.HasIndex(x => new { x.InstitutionId, x.Year }).IsUnique();
            e.HasOne(x => x.Institution).WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Section>(e =>
        {
            e.ToTable("sections");
            e.Property(x => x.Grade).HasMaxLength(50);
            e.Property(x => x.Name).HasMaxLength(50);
            e.HasIndex(x => new { x.AcademicYearId, x.Grade, x.Name }).IsUnique();
            e.HasOne(x => x.Institution).WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.AcademicYear).WithMany().HasForeignKey(x => x.AcademicYearId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<SectionTeacher>(e =>
        {
            e.ToTable("section_teachers");
            e.HasIndex(x => new { x.SectionId, x.TeacherId }).IsUnique();
            e.HasOne(x => x.Section).WithMany().HasForeignKey(x => x.SectionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Teacher).WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Student>(e =>
        {
            e.ToTable("students");
            e.Property(x => x.Code).HasMaxLength(50);
            e.Property(x => x.FullName).HasMaxLength(200);
            e.HasIndex(x => new { x.InstitutionId, x.Code }).IsUnique();
            e.HasOne(x => x.Institution).WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Enrollment>(e =>
        {
            e.ToTable("enrollments", t =>
            {
                t.HasCheckConstraint("ck_enrollments_status", In<EnrollmentStatus>("status"));
                t.HasCheckConstraint("ck_enrollments_dates", "end_date IS NULL OR end_date >= start_date");
            });
            e.Property(x => x.Status).HasConversion(new UpperEnumConverter<EnrollmentStatus>()).HasMaxLength(20);
            // Una matrícula ACTIVA por alumno y año; las retiradas conservan el historial (revisión I8).
            e.HasIndex(x => new { x.StudentId, x.AcademicYearId }, UxEnrollmentActivePerYear)
                .IsUnique().HasFilter("status = 'ACTIVE'");
            e.HasOne(x => x.Student).WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Section).WithMany().HasForeignKey(x => x.SectionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.AcademicYear).WithMany().HasForeignKey(x => x.AcademicYearId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Device>(e =>
        {
            e.ToTable("devices");
            e.Property(x => x.Id).ValueGeneratedNever();
            e.Property(x => x.Name).HasMaxLength(100);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<ClassSession>(e =>
        {
            e.ToTable("class_sessions", t =>
            {
                t.HasCheckConstraint("ck_class_sessions_status", In<SessionStatus>("status"));
                t.HasCheckConstraint("ck_class_sessions_version", "version >= 1");
            });
            ConfigureSync(e);
            e.Property(x => x.Slot).HasMaxLength(50);
            e.Property(x => x.CourseName).HasMaxLength(100);
            e.Property(x => x.Status).HasConversion(new UpperEnumConverter<SessionStatus>()).HasMaxLength(20);
            e.HasIndex(x => new { x.SectionId, x.Date, x.Slot }, UxSessionSectionDateSlot).IsUnique();
            e.HasOne(x => x.Section).WithMany().HasForeignKey(x => x.SectionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Teacher).WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Device).WithMany().HasForeignKey(x => x.DeviceId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.VoidedBy).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<AttendanceRecord>(e =>
        {
            e.ToTable("attendance_records", t =>
            {
                t.HasCheckConstraint("ck_attendance_records_status", In<AttendanceStatus>("status"));
                t.HasCheckConstraint("ck_attendance_records_version", "version >= 1");
                t.HasCheckConstraint("ck_attendance_records_void",
                    "(is_void AND voided_at IS NOT NULL) OR (NOT is_void AND voided_at IS NULL)");
            });
            ConfigureSync(e);
            e.Property(x => x.Status).HasConversion(new UpperEnumConverter<AttendanceStatus>()).HasMaxLength(20);
            e.Property(x => x.Note).HasMaxLength(500);
            // Un alumno por sesión = un registro (garantizado por la base de datos).
            e.HasIndex(x => new { x.SessionId, x.StudentId }, UxAttendanceSessionStudent).IsUnique();
            e.HasOne(x => x.Session).WithMany().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Student).WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Device).WithMany().HasForeignKey(x => x.DeviceId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.VoidedBy).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<NonSchoolDay>(e =>
        {
            e.ToTable("non_school_days");
            e.Property(x => x.Reason).HasMaxLength(200);
            e.HasIndex(x => new { x.InstitutionId, x.Date }).IsUnique();
            e.HasOne(x => x.Institution).WithMany().HasForeignKey(x => x.InstitutionId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<ChangeLogEntry>(e =>
        {
            e.ToTable("change_log", t => t.HasCheckConstraint("ck_change_log_operation", In<ChangeOperation>("operation")));
            e.HasKey(x => x.ServerChangeId);
            // El valor viene de sync_cursor dentro de la transacción: nunca BIGSERIAL/SEQUENCE (D8).
            e.Property(x => x.ServerChangeId).ValueGeneratedNever();
            e.Property(x => x.Entity).HasMaxLength(50);
            e.Property(x => x.Operation).HasConversion(new UpperEnumConverter<ChangeOperation>()).HasMaxLength(20);
            e.Property(x => x.PreviousStatus).HasMaxLength(20);
            e.HasIndex(x => new { x.Entity, x.EntityId });
        });

        b.Entity<SyncCursor>(e =>
        {
            e.ToTable("sync_cursor", t =>
            {
                t.HasCheckConstraint("ck_sync_cursor_single_row", "id = 1");
                t.HasCheckConstraint("ck_sync_cursor_value", "value >= 0");
            });
            e.Property(x => x.Id).ValueGeneratedNever();
            e.HasData(new SyncCursor { Id = 1, Value = 0 });
        });

        ApplySnakeCaseNames(b);
    }

    private static void ConfigureSync<T>(EntityTypeBuilder<T> e) where T : class, ISyncEntity
    {
        // El id lo genera la tablet (D4).
        e.Property(nameof(ISyncEntity.Id)).ValueGeneratedNever();
        e.HasIndex(nameof(ISyncEntity.ServerChangeId));
    }

    /// <summary>Asigna created_at/updated_at con el reloj del servidor.</summary>
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken ct = default)
    {
        StampTimestamps();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampTimestamps();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    private void StampTimestamps()
    {
        var now = DateTime.UtcNow;
        foreach (var entry in ChangeTracker.Entries<ITimestamped>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
                entry.Property(x => x.CreatedAt).IsModified = false;
            }
        }
        foreach (var entry in ChangeTracker.Entries<ChangeLogEntry>())
        {
            if (entry.State == EntityState.Added) entry.Entity.CreatedAt = now;
        }
    }

    // ---------- utilidades de mapeo ----------

    /// <summary>CHECK "col IN ('A','B',...)" a partir de un enum (DEC-004).</summary>
    private static string In<TEnum>(string column) where TEnum : struct, Enum =>
        $"{column} IN ({string.Join(", ", Enum.GetNames<TEnum>().Select(n => $"'{n.ToUpperInvariant()}'"))})";

    /// <summary>Tablas/columnas/restricciones en snake_case sin dependencias extra (DEC-005).</summary>
    private static void ApplySnakeCaseNames(ModelBuilder b)
    {
        foreach (var entity in b.Model.GetEntityTypes())
        {
            var table = entity.GetTableName()!;
            foreach (var p in entity.GetProperties())
                p.SetColumnName(ToSnake(p.Name));

            foreach (var k in entity.GetKeys())
                if (k.IsPrimaryKey()) k.SetName($"pk_{table}");

            foreach (var fk in entity.GetForeignKeys())
                fk.SetConstraintName($"fk_{table}_{string.Join("_", fk.Properties.Select(p => p.GetColumnName()))}");

            foreach (var ix in entity.GetIndexes())
                if (ix.Name is null) // solo los índices sin nombre explícito
                    ix.SetDatabaseName($"ix_{table}_{string.Join("_", ix.Properties.Select(p => p.GetColumnName()))}");
        }
    }

    internal static string ToSnake(string name)
    {
        var sb = new StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                var prevLower = i > 0 && char.IsLower(name[i - 1]);
                var nextLower = i > 0 && i + 1 < name.Length && char.IsLower(name[i + 1]) && char.IsUpper(name[i - 1]);
                if (prevLower || nextLower) sb.Append('_');
                sb.Append(char.ToLowerInvariant(c));
            }
            else sb.Append(c);
        }
        return sb.ToString();
    }
}

/// <summary>Guarda enums como texto en MAYÚSCULAS (PRESENT, TAKEN, ...).</summary>
public sealed class UpperEnumConverter<T>() : ValueConverter<T, string>(
    v => v.ToString().ToUpperInvariant(),
    v => Enum.Parse<T>(v, true)) where T : struct, Enum;
