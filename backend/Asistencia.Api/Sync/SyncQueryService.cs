using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Api.Sync;

public sealed class SyncQueryService(AppDbContext db)
{
    private const int DefaultLimit = 100;
    private const int MaxLimit = 500;

    /// <summary>
    /// GET /sync/changes?cursor=N
    /// Entrega cambios con server_change_id > N leídos de change_log, deduplicando por entidad
    /// y devolviendo el estado actual. Regla 6.2: nextCursor avanza hasta el máximo server_change_id
    /// incluido en la página consultada.
    /// </summary>
    public Task<SyncChangesResponse> GetChangesAsync(long cursor, int limit, CancellationToken ct)
        => GetChangesAsync(cursor, limit, null, ct);

    public async Task<SyncChangesResponse> GetChangesAsync(long cursor, int limit = DefaultLimit, Guid? requestingUserId = null, CancellationToken ct = default)
    {
        if (limit <= 0) limit = DefaultLimit;
        if (limit > MaxLimit) limit = MaxLimit;

        // Cargar información de autorización si se proporciona usuario
        List<Guid>? allowedSectionIds = null;
        List<Guid>? allowedStudentIds = null;
        Guid? institutionId = null;

        if (requestingUserId.HasValue)
        {
            var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == requestingUserId.Value, ct);
            if (user != null)
            {
                institutionId = user.InstitutionId;
                if (user.Role == UserRole.Teacher)
                {
                    var teacher = await db.Teachers.AsNoTracking().FirstOrDefaultAsync(t => t.UserId == user.Id, ct);
                    if (teacher != null)
                    {
                        allowedSectionIds = await db.SectionTeachers.AsNoTracking()
                            .Where(st => st.TeacherId == teacher.Id)
                            .Select(st => st.SectionId)
                            .ToListAsync(ct);

                        allowedStudentIds = await db.Enrollments.AsNoTracking()
                            .Where(e => allowedSectionIds.Contains(e.SectionId))
                            .Select(e => e.StudentId)
                            .Distinct()
                            .ToListAsync(ct);
                    }
                    else
                    {
                        allowedSectionIds = [];
                        allowedStudentIds = [];
                    }
                }
                // Si es Auxiliary o Admin, allowedSectionIds queda en null (acceso a las secciones de la institución)
            }
        }

        // Leer página de change_log por orden estricto de server_change_id
        var rawEntries = await db.ChangeLog
            .Where(c => c.ServerChangeId > cursor)
            .OrderBy(c => c.ServerChangeId)
            .Take(limit + 1)
            .ToListAsync(ct);

        var hasMore = rawEntries.Count > limit;
        var page = hasMore ? rawEntries.Take(limit).ToList() : rawEntries;

        if (page.Count == 0)
        {
            return new SyncChangesResponse
            {
                NextCursor = cursor,
                HasMore = false,
                Changes = [],
                ServerTime = DateTimeOffset.UtcNow
            };
        }

        // Regla 6.2: nextCursor avanza hasta el máximo server_change_id considerado en esta página
        var nextCursor = page.Max(p => p.ServerChangeId);

        // Agrupar por (entity, entityId) tomando el último cambio dentro de la página para deduplicar
        var distinctTargets = page
            .GroupBy(p => (p.Entity, p.EntityId))
            .Select(g => g.OrderByDescending(x => x.ServerChangeId).First())
            .ToList();

        var changeDtos = new List<EntityChangeDto>();

        foreach (var entry in distinctTargets)
        {
            var data = await LoadCurrentEntityDataAsync(entry.Entity, entry.EntityId, institutionId, allowedSectionIds, allowedStudentIds, ct);
            if (data != null)
            {
                changeDtos.Add(new EntityChangeDto
                {
                    ServerChangeId = entry.ServerChangeId,
                    Entity = entry.Entity,
                    EntityId = entry.EntityId,
                    Operation = entry.Operation.ToString().ToUpperInvariant(),
                    Data = data
                });
            }
        }

        // Ordenar la salida por serverChangeId para coherencia de entrega
        changeDtos = changeDtos.OrderBy(c => c.ServerChangeId).ToList();

        return new SyncChangesResponse
        {
            NextCursor = nextCursor,
            HasMore = hasMore,
            Changes = changeDtos,
            ServerTime = DateTimeOffset.UtcNow
        };
    }

    private async Task<object?> LoadCurrentEntityDataAsync(
        string entity,
        Guid entityId,
        Guid? institutionId,
        List<Guid>? allowedSectionIds,
        List<Guid>? allowedStudentIds,
        CancellationToken ct)
    {
        return entity switch
        {
            EntityNames.AcademicYear => await db.AcademicYears.AsNoTracking()
                .Where(x => x.Id == entityId && (!institutionId.HasValue || x.InstitutionId == institutionId.Value))
                .Select(x => new
                {
                    id = x.Id,
                    institutionId = x.InstitutionId,
                    year = x.Year,
                    startDate = x.StartDate,
                    endDate = x.EndDate
                }).FirstOrDefaultAsync(ct),

            EntityNames.Section => await db.Sections.AsNoTracking()
                .Where(x => x.Id == entityId &&
                            (!institutionId.HasValue || x.InstitutionId == institutionId.Value) &&
                            (allowedSectionIds == null || allowedSectionIds.Contains(x.Id)))
                .Select(x => new
                {
                    id = x.Id,
                    institutionId = x.InstitutionId,
                    academicYearId = x.AcademicYearId,
                    grade = x.Grade,
                    name = x.Name
                }).FirstOrDefaultAsync(ct),

            EntityNames.SectionTeacher => await db.SectionTeachers.AsNoTracking()
                .Where(x => x.Id == entityId &&
                            (allowedSectionIds == null || allowedSectionIds.Contains(x.SectionId)))
                .Select(x => new
                {
                    id = x.Id,
                    sectionId = x.SectionId,
                    teacherId = x.TeacherId
                }).FirstOrDefaultAsync(ct),

            EntityNames.Student => await db.Students.AsNoTracking()
                .Where(x => x.Id == entityId &&
                            (!institutionId.HasValue || x.InstitutionId == institutionId.Value) &&
                            (allowedStudentIds == null || allowedStudentIds.Contains(x.Id)))
                .Select(x => new
                {
                    id = x.Id,
                    institutionId = x.InstitutionId,
                    code = x.Code,
                    fullName = x.FullName
                }).FirstOrDefaultAsync(ct),

            EntityNames.Enrollment => await db.Enrollments.AsNoTracking()
                .Where(x => x.Id == entityId &&
                            (allowedSectionIds == null || allowedSectionIds.Contains(x.SectionId)))
                .Select(x => new
                {
                    id = x.Id,
                    studentId = x.StudentId,
                    sectionId = x.SectionId,
                    academicYearId = x.AcademicYearId,
                    status = x.Status.ToString().ToUpperInvariant(),
                    startDate = x.StartDate,
                    endDate = x.EndDate
                }).FirstOrDefaultAsync(ct),

            EntityNames.ClassSession => await db.ClassSessions.AsNoTracking()
                .Where(x => x.Id == entityId &&
                            (allowedSectionIds == null || allowedSectionIds.Contains(x.SectionId)))
                .Select(x => new
                {
                    id = x.Id,
                    sectionId = x.SectionId,
                    teacherId = x.TeacherId,
                    date = x.Date,
                    slot = x.Slot,
                    courseName = x.CourseName,
                    status = x.Status.ToString().ToUpperInvariant(),
                    version = x.Version,
                    serverChangeId = x.ServerChangeId
                }).FirstOrDefaultAsync(ct),

            EntityNames.AttendanceRecord => await (
                from r in db.AttendanceRecords.AsNoTracking()
                join s in db.ClassSessions.AsNoTracking() on r.SessionId equals s.Id
                where r.Id == entityId && (allowedSectionIds == null || allowedSectionIds.Contains(s.SectionId))
                select new
                {
                    id = r.Id,
                    sessionId = r.SessionId,
                    studentId = r.StudentId,
                    status = r.Status.ToString().ToUpperInvariant(),
                    note = r.Note,
                    isVoid = r.IsVoid,
                    version = r.Version,
                    serverChangeId = r.ServerChangeId
                }).FirstOrDefaultAsync(ct),

            _ => null
        };
    }
}
