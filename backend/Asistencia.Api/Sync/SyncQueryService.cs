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
    public async Task<SyncChangesResponse> GetChangesAsync(long cursor, int limit = DefaultLimit, CancellationToken ct = default)
    {
        if (limit <= 0) limit = DefaultLimit;
        if (limit > MaxLimit) limit = MaxLimit;

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
            var data = await LoadCurrentEntityDataAsync(entry.Entity, entry.EntityId, ct);
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

    private async Task<object?> LoadCurrentEntityDataAsync(string entity, Guid entityId, CancellationToken ct)
    {
        return entity switch
        {
            EntityNames.AcademicYear => await db.AcademicYears.AsNoTracking()
                .Where(x => x.Id == entityId)
                .Select(x => new
                {
                    id = x.Id,
                    institutionId = x.InstitutionId,
                    year = x.Year,
                    startDate = x.StartDate,
                    endDate = x.EndDate
                }).FirstOrDefaultAsync(ct),

            EntityNames.Section => await db.Sections.AsNoTracking()
                .Where(x => x.Id == entityId)
                .Select(x => new
                {
                    id = x.Id,
                    institutionId = x.InstitutionId,
                    academicYearId = x.AcademicYearId,
                    grade = x.Grade,
                    name = x.Name
                }).FirstOrDefaultAsync(ct),

            EntityNames.SectionTeacher => await db.SectionTeachers.AsNoTracking()
                .Where(x => x.Id == entityId)
                .Select(x => new
                {
                    id = x.Id,
                    sectionId = x.SectionId,
                    teacherId = x.TeacherId
                }).FirstOrDefaultAsync(ct),

            EntityNames.Student => await db.Students.AsNoTracking()
                .Where(x => x.Id == entityId)
                .Select(x => new
                {
                    id = x.Id,
                    institutionId = x.InstitutionId,
                    code = x.Code,
                    fullName = x.FullName
                }).FirstOrDefaultAsync(ct),

            EntityNames.Enrollment => await db.Enrollments.AsNoTracking()
                .Where(x => x.Id == entityId)
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
                .Where(x => x.Id == entityId)
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

            EntityNames.AttendanceRecord => await db.AttendanceRecords.AsNoTracking()
                .Where(x => x.Id == entityId)
                .Select(x => new
                {
                    id = x.Id,
                    sessionId = x.SessionId,
                    studentId = x.StudentId,
                    status = x.Status.ToString().ToUpperInvariant(),
                    note = x.Note,
                    isVoid = x.IsVoid,
                    version = x.Version,
                    serverChangeId = x.ServerChangeId
                }).FirstOrDefaultAsync(ct),

            _ => null
        };
    }
}
