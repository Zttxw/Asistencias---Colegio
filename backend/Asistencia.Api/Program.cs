using System.Security.Claims;
using System.Text;
using Asistencia.Api.Auth;
using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAsistenciaData(builder.Configuration);

var isDevelopment = builder.Environment.IsDevelopment();
var jwtKey = builder.Configuration["JWT_SECRET"]
             ?? builder.Configuration["Jwt:Key"];

// Validación de seguridad de JWT_SECRET fuera de desarrollo (Punto 5)
JwtTokenService.ValidateJwtSecret(jwtKey, isDevelopment);
if (isDevelopment)
{
    jwtKey ??= JwtTokenService.DefaultKey;
}

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? JwtTokenService.DefaultIssuer;
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? JwtTokenService.DefaultAudience;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"];
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// HTTPS se termina fuera de Kestrel (tailscale serve / Caddy): sin UseHttpsRedirection (D12).

await app.InitializeDatabaseAsync();

// Comando administrativo CLI para gestión de usuarios (Punto 4)
if (args.Length > 0 && args[0].Equals("user", StringComparison.OrdinalIgnoreCase))
{
    var action = args.Length > 1 ? args[1].ToLowerInvariant() : "help";
    if (action == "create")
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>();

        string ReadMasked()
        {
            if (Console.IsInputRedirected)
            {
                return Console.ReadLine()?.Trim() ?? "";
            }
            var sb = new StringBuilder();
            while (true)
            {
                var key = Console.ReadKey(intercept: true);
                if (key.Key == ConsoleKey.Enter) break;
                if (key.Key == ConsoleKey.Backspace && sb.Length > 0)
                {
                    sb.Length--;
                }
                else if (!char.IsControl(key.KeyChar))
                {
                    sb.Append(key.KeyChar);
                }
            }
            Console.WriteLine();
            return sb.ToString();
        }

        string username;
        string fullName;
        string roleStr;
        string password;

        if (args.Length >= 6)
        {
            username = args[2].Trim();
            fullName = args[3].Trim();
            roleStr = args[4].Trim();
            password = args[5];
        }
        else
        {
            Console.Write("Usuario: ");
            username = (Console.ReadLine() ?? "").Trim();
            Console.Write("Nombre completo: ");
            fullName = (Console.ReadLine() ?? "").Trim();
            Console.Write("Rol (TEACHER / AUXILIARY / ADMIN): ");
            roleStr = (Console.ReadLine() ?? "").Trim();
            Console.Write("Contraseña: ");
            password = ReadMasked();
            Console.Write("Confirmar contraseña: ");
            var confirmPassword = ReadMasked();

            if (password != confirmPassword)
            {
                Console.Error.WriteLine("Error: Las contraseñas no coinciden.");
                Environment.Exit(1);
            }
        }

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            Console.Error.WriteLine("Error: Usuario y contraseña no pueden estar vacíos.");
            Environment.Exit(1);
        }

        if (password.Length < 8)
        {
            Console.Error.WriteLine("Error: La contraseña debe tener al menos 8 caracteres.");
            Environment.Exit(1);
        }

        if (!Enum.TryParse<UserRole>(roleStr, true, out var role))
        {
            Console.Error.WriteLine($"Error: Rol inválido '{roleStr}'. Valores permitidos: TEACHER, AUXILIARY, ADMIN.");
            Environment.Exit(1);
        }

        var normalizedUsername = username.ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Username.ToLower() == normalizedUsername))
        {
            Console.Error.WriteLine($"Error: Ya existe un usuario con nombre '{username}'.");
            Environment.Exit(1);
        }

        var institution = await db.Institutions.FirstOrDefaultAsync();
        if (institution == null)
        {
            institution = new Institution { Id = Guid.NewGuid(), Name = "I.E. Piloto Chumbivilcas" };
            db.Institutions.Add(institution);
            await db.SaveChangesAsync();
        }

        var newUser = new User
        {
            Id = Guid.NewGuid(),
            InstitutionId = institution.Id,
            Username = username,
            Role = role
        };
        newUser.PasswordHash = hasher.HashPassword(newUser, password);
        db.Users.Add(newUser);

        if (role == UserRole.Teacher)
        {
            var teacher = new Teacher
            {
                Id = Guid.NewGuid(),
                UserId = newUser.Id,
                FullName = string.IsNullOrWhiteSpace(fullName) ? username : fullName
            };
            db.Teachers.Add(teacher);
        }

        await db.SaveChangesAsync();
        Console.WriteLine($"Usuario '{newUser.Username}' con rol '{newUser.Role}' creado exitosamente.");
        Environment.Exit(0);
    }
    else
    {
        Console.WriteLine("Uso: dotnet run -- user create [<username> <nombre> <rol> <password>]");
        Environment.Exit(1);
    }
}

// Comando administrativo CLI para análisis/importación de padrón
if (args.Length > 0 && args[0].Equals("roster", StringComparison.OrdinalIgnoreCase))
{
    var cmd = args.Length > 1 ? args[1].ToLowerInvariant() : "help";
    var filePath = args.Length > 2 ? args[2] : null;

    Stream OpenExcelStream(string path)
    {
        if (path == "-")
        {
            var ms = new MemoryStream();
            Console.OpenStandardInput().CopyTo(ms);
            ms.Position = 0;
            return ms;
        }

        if (!File.Exists(path))
        {
            Console.Error.WriteLine($"Error: Archivo no encontrado en '{filePath}'.");
            Environment.Exit(1);
        }

        return File.OpenRead(path);
    }

    if (cmd == "dry-run" && !string.IsNullOrWhiteSpace(filePath))
    {
        using var stream = OpenExcelStream(filePath);
        var report = Asistencia.Api.Import.ExcelRosterParser.Analyze(stream);
        Console.WriteLine(report.FormatSummary());
        Environment.Exit(report.Errors.Count == 0 ? 0 : 1);
    }
    else if (cmd == "import" && !string.IsNullOrWhiteSpace(filePath))
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var importer = scope.ServiceProvider.GetRequiredService<Asistencia.Api.Import.RosterImporter>();

        var teacher = await db.Teachers.FirstOrDefaultAsync();
        var year = await db.AcademicYears.FirstOrDefaultAsync();
        var institution = await db.Institutions.FirstOrDefaultAsync();

        if (teacher == null || year == null || institution == null)
        {
            Console.Error.WriteLine("Error: Se requiere que existan Institution, AcademicYear y Teacher en la base de datos.");
            Environment.Exit(1);
        }

        using var stream = OpenExcelStream(filePath);
        var result = await importer.ImportAsync(stream, institution.Id, year.Id, teacher.Id);
        Console.WriteLine(result.FormatSummary());
        Environment.Exit(result.Success ? 0 : 1);
    }
    else
    {
        Console.WriteLine("Uso: dotnet run -- roster <dry-run|import> <ruta-al-archivo-excel.xlsx | ->");
        Environment.Exit(1);
    }
}

app.UseCors("FrontendPolicy");
app.UseAuthentication();
app.UseAuthorization();

var api = app.MapGroup("/api");

// Autenticación: Login con protección de bloqueo por intentos fallidos (Punto 8)
api.MapPost("/auth/login", async (LoginRequest request, AuthService authService, CancellationToken ct) =>
{
    var result = await authService.LoginAsync(request, ct);
    return result.Status switch
    {
        LoginStatus.Success => Results.Ok(result.Response),
        LoginStatus.LockedOut => Results.Json(new
        {
            error = result.ErrorMessage,
            retryAfterSeconds = (int)Math.Max(1, result.LockoutRemaining?.TotalSeconds ?? 300)
        }, statusCode: StatusCodes.Status429TooManyRequests),
        _ => Results.Json(new { error = result.ErrorMessage ?? "Credenciales inválidas" }, statusCode: StatusCodes.Status401Unauthorized)
    };
});

// Salud del servicio + hora del servidor (la tablet la usará para corregir su reloj; revisión B3).
api.MapGet("/health", async (AppDbContext db, CancellationToken ct) =>
{
    var dbOk = await db.Database.CanConnectAsync(ct);
    var cursor = dbOk ? await db.SyncCursor.Where(c => c.Id == 1).Select(c => c.Value).FirstOrDefaultAsync(ct) : (long?)null;
    var body = new
    {
        status = dbOk ? "ok" : "degraded",
        serverTime = DateTimeOffset.UtcNow,
        serverDate = LimaClock.Today(),
        serverCursor = cursor,
    };
    return dbOk ? Results.Ok(body) : Results.Json(body, statusCode: StatusCodes.Status503ServiceUnavailable);
});

// Bootstrap para inicializar datos base del piloto en la tablet (docente, sección y alumnos)
api.MapGet("/bootstrap", async (AppDbContext db, CancellationToken ct) =>
{
    var teacher = await db.Teachers.Include(t => t.User).FirstOrDefaultAsync(ct);
    var section = await db.Sections.OrderBy(s => s.Grade).ThenBy(s => s.Name).FirstOrDefaultAsync(ct);
    var enrollment = section != null
        ? await db.Enrollments.Include(e => e.Student)
            .OrderBy(e => e.Student.FullName)
            .FirstOrDefaultAsync(e => e.SectionId == section.Id && e.Status == EnrollmentStatus.Active, ct)
        : null;
    var student = enrollment?.Student ?? await db.Students.FirstOrDefaultAsync(ct);

    if (teacher is null || section is null || student is null)
        return Results.NotFound(new { error = "No hay datos semilla en el servidor" });

    var sections = await db.Sections.AsNoTracking().Select(s => new
    {
        id = s.Id,
        grade = s.Grade,
        name = s.Name,
        displayName = $"{s.Grade}° \"{s.Name}\"",
        studentCount = db.Enrollments.Count(e => e.SectionId == s.Id && e.Status == EnrollmentStatus.Active),
        teacherName = db.SectionTeachers.Where(st => st.SectionId == s.Id).Select(st => st.Teacher.FullName).FirstOrDefault() ?? "Docente de Prueba",
        teacherId = db.SectionTeachers.Where(st => st.SectionId == s.Id).Select(st => (Guid?)st.TeacherId).FirstOrDefault()
    }).ToListAsync(ct);

    var students = await db.Enrollments.AsNoTracking()
        .Where(e => e.Status == EnrollmentStatus.Active)
        .Include(e => e.Student)
        .OrderBy(e => e.Student.FullName)
        .Select(e => new
        {
            id = e.Student.Id,
            sectionId = e.SectionId,
            code = e.Student.Code,
            fullName = e.Student.FullName
        }).ToListAsync(ct);

    return Results.Ok(new
    {
        teacherId = teacher.Id,
        teacherName = teacher.FullName,
        sectionId = section.Id,
        sectionName = $"{section.Grade}° \"{section.Name}\"",
        studentId = student.Id,
        studentName = student.FullName,
        studentCode = student.Code,
        serverDate = LimaClock.Today(),
        sections,
        students
    });
});

// Carga de padrón escolar mediante archivo Excel (.xlsx / .xls)
api.MapPost("/roster/upload", async (IFormFile? file,
                                     bool? clearDemo,
                                     AppDbContext db,
                                     ClaimsPrincipal principal,
                                     Asistencia.Api.Import.RosterImporter importer,
                                     CancellationToken ct) =>
{
    if (principal.IsInRole("AUXILIARY") || principal.FindFirstValue(ClaimTypes.Role) == "AUXILIARY")
    {
        return Results.Json(new { error = "No autorizado: El rol AUXILIARY no tiene permisos para cargar el padrón escolar." }, statusCode: StatusCodes.Status403Forbidden);
    }

    if (file is null || file.Length == 0)
        return Results.BadRequest(new { error = "No se envió ningún archivo Excel válido." });

    if (!file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase) &&
        !file.FileName.EndsWith(".xls", StringComparison.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { error = "El archivo debe tener formato Excel (.xlsx o .xls)." });
    }

    var teacher = await db.Teachers.FirstOrDefaultAsync(ct);
    var year = await db.AcademicYears.FirstOrDefaultAsync(ct);
    var institution = await db.Institutions.FirstOrDefaultAsync(ct);

    if (teacher == null || year == null || institution == null)
        return Results.BadRequest(new { error = "La base de datos institucional aún no está configurada." });

    if (clearDemo == true)
    {
        await db.AttendanceRecords.ExecuteDeleteAsync(ct);
        await db.ClassSessions.ExecuteDeleteAsync(ct);
        await db.Enrollments.ExecuteDeleteAsync(ct);
        await db.Students.ExecuteDeleteAsync(ct);
        await db.SectionTeachers.ExecuteDeleteAsync(ct);
        await db.Sections.ExecuteDeleteAsync(ct);
    }

    using var stream = file.OpenReadStream();
    var result = await importer.ImportAsync(stream, institution.Id, year.Id, teacher.Id, ct);

    if (!result.Success)
    {
        return Results.BadRequest(new
        {
            success = false,
            errors = result.Errors,
            warnings = result.Warnings,
            ambiguousCount = result.AmbiguousCount
        });
    }

    return Results.Ok(new
    {
        success = true,
        sectionsCreated = result.SectionsCreated,
        sectionsMatched = result.SectionsMatched,
        studentsCreated = result.StudentsCreated,
        studentsMatched = result.StudentsMatched,
        warnings = result.Warnings,
        summary = result.FormatSummary()
    });
}).DisableAntiforgery();

// Registro manual de estudiante
api.MapPost("/students", async (CreateStudentManualRequest request,
                                AppDbContext db,
                                ClaimsPrincipal principal,
                                CancellationToken ct) =>
{
    if (principal.IsInRole("AUXILIARY") || principal.FindFirstValue(ClaimTypes.Role) == "AUXILIARY")
    {
        return Results.Json(new { error = "No autorizado: El rol AUXILIARY no tiene permisos para crear o matricular estudiantes." }, statusCode: StatusCodes.Status403Forbidden);
    }

    if (string.IsNullOrWhiteSpace(request.FullName) || request.SectionId == Guid.Empty)
        return Results.BadRequest(new { error = "Sección y nombres del alumno son requeridos." });

    var institution = await db.Institutions.FirstOrDefaultAsync(ct);
    var year = await db.AcademicYears.FirstOrDefaultAsync(ct);
    if (institution == null || year == null)
        return Results.BadRequest(new { error = "Configuración institucional incompleta." });

    var code = string.IsNullOrWhiteSpace(request.Code)
        ? $"A{await db.Students.CountAsync(ct) + 1:D3}"
        : request.Code.Trim();

    var student = new Student
    {
        Id = request.Id ?? Guid.NewGuid(),
        InstitutionId = institution.Id,
        FullName = request.FullName.Trim().ToUpperInvariant(),
        Code = code,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    var enrollment = new Enrollment
    {
        Id = Guid.NewGuid(),
        StudentId = student.Id,
        SectionId = request.SectionId,
        AcademicYearId = year.Id,
        Status = EnrollmentStatus.Active,
        StartDate = LimaClock.Today(),
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    db.Students.Add(student);
    db.Enrollments.Add(enrollment);
    await db.SaveChangesAsync(ct);

    return Results.Ok(new
    {
        id = student.Id,
        sectionId = request.SectionId,
        code = student.Code,
        fullName = student.FullName
    });
});

// Protocolo de sincronización: subida
api.MapPost("/sync", async (Asistencia.Api.Sync.SyncPushRequest request,
                            Asistencia.Api.Sync.SyncProcessor processor,
                            AppDbContext db,
                            ClaimsPrincipal principal,
                            HttpContext context,
                            CancellationToken ct) =>
{
    var authHeader = context.Request.Headers.Authorization.ToString();
    if (!string.IsNullOrWhiteSpace(authHeader))
    {
        if (principal.Identity?.IsAuthenticated != true)
        {
            return Results.Json(new
            {
                error = "Sesión expirada o token inválido. Inicia sesión nuevamente para sincronizar."
            }, statusCode: StatusCodes.Status401Unauthorized);
        }
    }

    Guid userId;
    var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
    if (Guid.TryParse(sub, out var parsedId))
    {
        userId = parsedId;
    }
    else
    {
        // En la Fase 2 vertical slice tomamos el usuario docente registrado en seed/BD si no hay JWT
        var user = await db.Users.FirstOrDefaultAsync(u => u.Role == UserRole.Teacher, ct)
                   ?? await db.Users.FirstAsync(ct);
        userId = user.Id;
    }

    var currentUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct);
    if (currentUser != null && currentUser.Role == UserRole.Auxiliary)
    {
        return Results.Json(new Asistencia.Api.Sync.SyncPushResponse
        {
            Results = request.Items.Select(item => new Asistencia.Api.Sync.SyncItemResult
            {
                Id = item.Id,
                Status = Asistencia.Api.Sync.SyncItemStatus.Rejected,
                Error = "No autorizado: El rol AUXILIARY no tiene permisos de escritura en sincronización."
            }).ToList(),
            ServerCursor = await db.SyncCursor.Where(c => c.Id == 1).Select(c => c.Value).FirstOrDefaultAsync(ct),
            ServerTime = DateTimeOffset.UtcNow
        }, statusCode: StatusCodes.Status403Forbidden);
    }

    var response = await processor.ProcessPushAsync(request, userId, ct);
    return Results.Ok(response);
});

// Protocolo de sincronización: bajada
api.MapGet("/sync/changes", async (long cursor,
                                   int? limit,
                                   Asistencia.Api.Sync.SyncQueryService queryService,
                                   ClaimsPrincipal principal,
                                   CancellationToken ct) =>
{
    Guid? userId = null;
    var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub");
    if (Guid.TryParse(sub, out var parsedId))
    {
        userId = parsedId;
    }

    var response = await queryService.GetChangesAsync(cursor, limit ?? 100, userId, ct);
    return Results.Ok(response);
});

// Listar usuarios institucionales para el panel del Director/Administrador
api.MapGet("/admin/users", async (AppDbContext db,
                                  ClaimsPrincipal principal,
                                  CancellationToken ct) =>
{
    var users = await db.Users.AsNoTracking().OrderBy(u => u.Role).ThenBy(u => u.Username).Select(u => new
    {
        id = u.Id,
        username = u.Username,
        role = u.Role.ToString(),
        fullName = db.Teachers.Where(t => t.UserId == u.Id).Select(t => t.FullName).FirstOrDefault()
                   ?? (u.Role == UserRole.Admin ? "Director / Administrador" : u.Role == UserRole.Auxiliary ? "Auxiliar de Educación" : u.Username),
        createdAt = u.CreatedAt,
        updatedAt = u.UpdatedAt
    }).ToListAsync(ct);

    return Results.Ok(users);
});

// Recuperación y restablecimiento de contraseñas por parte del Administrador
api.MapPost("/admin/users/reset-password", async (ResetUserPasswordRequest request,
                                                  AppDbContext db,
                                                  ClaimsPrincipal principal,
                                                  IPasswordHasher<User> hasher,
                                                  CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Username))
        return Results.BadRequest(new { error = "El nombre de usuario es requerido." });

    var user = await db.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == request.Username.Trim().ToLower(), ct);
    if (user == null)
        return Results.NotFound(new { error = $"Usuario '{request.Username}' no encontrado en la base de datos." });

    string newPass = string.IsNullOrWhiteSpace(request.NewPassword)
        ? (user.Role switch
        {
            UserRole.Teacher => "clave-docente-segura-123",
            UserRole.Auxiliary => "clave-auxiliar-segura-123",
            UserRole.Admin => "clave-admin-segura-123",
            _ => "clave-segura-123"
        })
        : request.NewPassword.Trim();

    if (newPass.Length < 6)
        return Results.BadRequest(new { error = "La contraseña debe tener al menos 6 caracteres." });

    user.PasswordHash = hasher.HashPassword(user, newPass);
    user.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync(ct);

    return Results.Ok(new
    {
        success = true,
        username = user.Username,
        role = user.Role.ToString(),
        newPassword = newPass,
        message = $"Contraseña para '{user.Username}' actualizada correctamente."
    });
});

// Sincronización de credenciales estándar oficiales (Admin, Auxiliar, Docente)
try
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>();

    var standardAccounts = new (string Username, UserRole Role, string Password, string FullName)[]
    {
        ("admin", UserRole.Admin, "clave-admin-segura-123", "Director / Administrador"),
        ("auxiliar", UserRole.Auxiliary, "clave-auxiliar-segura-123", "Auxiliar de Educación"),
        ("docente", UserRole.Teacher, "clave-docente-segura-123", "Docente de Prueba")
    };

    var institution = await db.Institutions.FirstOrDefaultAsync();
    if (institution != null)
    {
        foreach (var acc in standardAccounts)
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == acc.Username);
            if (user != null)
            {
                var verify = hasher.VerifyHashedPassword(user, user.PasswordHash, acc.Password);
                if (verify != PasswordVerificationResult.Success)
                {
                    user.PasswordHash = hasher.HashPassword(user, acc.Password);
                    user.UpdatedAt = DateTime.UtcNow;
                }
            }
            else
            {
                var newUser = new User
                {
                    Id = Guid.NewGuid(),
                    InstitutionId = institution.Id,
                    Username = acc.Username,
                    Role = acc.Role,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                newUser.PasswordHash = hasher.HashPassword(newUser, acc.Password);
                db.Users.Add(newUser);
                if (acc.Role == UserRole.Teacher)
                {
                    db.Teachers.Add(new Teacher
                    {
                        Id = Guid.NewGuid(),
                        UserId = newUser.Id,
                        FullName = acc.FullName
                    });
                }
            }
        }
        await db.SaveChangesAsync();
    }
}
catch (Exception ex)
{
    app.Logger.LogWarning("Omitiendo sincronización de credenciales iniciales: {Message}", ex.Message);
}

app.Run();

/// <summary>Expuesto para pruebas de integración (WebApplicationFactory).</summary>
public partial class Program;

public record CreateStudentManualRequest(Guid SectionId, string FullName, string? Code, Guid? Id = null);

public record ResetUserPasswordRequest(string Username, string? NewPassword = null);
