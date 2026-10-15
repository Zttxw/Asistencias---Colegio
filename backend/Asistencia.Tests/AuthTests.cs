using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Asistencia.Api.Auth;
using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Asistencia.Tests.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Asistencia.Tests;

/// <summary>
/// Pruebas del sistema de autenticación y login (Requisito 10):
/// - TEACHER, AUXILIARY, ADMIN
/// - Hashing seguro con PBKDF2 / IPasswordHasher
/// - Generación y validación de JWT con claims sub, role, institution_id
/// - Rechazo de credenciales inválidas
/// </summary>
public sealed class AuthTests(PostgresFixture fx) : IClassFixture<PostgresFixture>
{
    private static IConfiguration CreateConfig() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "clave_de_prueba_jwt_segura_de_32_bytes_minimo!!",
                ["Jwt:Issuer"] = "asistencia-test",
                ["Jwt:Audience"] = "asistencia-app-test",
                ["Jwt:ExpiresHours"] = "4"
            })
            .Build();

    private async Task<(User User, Teacher? Teacher)> CreateUserAsync(AppDbContext db, string username, string password, UserRole role, string? fullName = null)
    {
        var hasher = new PasswordHasher<User>();
        var inst = await db.Institutions.FirstOrDefaultAsync() ?? new Institution { Id = Guid.NewGuid(), Name = "Colegio Test" };
        if (await db.Institutions.FindAsync(inst.Id) == null) db.Institutions.Add(inst);

        var user = new User
        {
            Id = Guid.NewGuid(),
            InstitutionId = inst.Id,
            Username = username,
            Role = role,
        };
        user.PasswordHash = hasher.HashPassword(user, password);
        db.Users.Add(user);

        Teacher? teacher = null;
        if (role == UserRole.Teacher && fullName != null)
        {
            teacher = new Teacher { Id = Guid.NewGuid(), UserId = user.Id, FullName = fullName };
            db.Teachers.Add(teacher);
        }

        await db.SaveChangesAsync();
        return (user, teacher);
    }

    [Fact]
    public async Task Login_WithValidTeacherCredentials_ReturnsJwtAndUserDto()
    {
        await using var db = fx.CreateContext();
        var (user, teacher) = await CreateUserAsync(db, "docente_login", "pass12345", UserRole.Teacher, "Profesor Juan");

        var config = CreateConfig();
        var jwtService = new JwtTokenService(config);
        var lockoutTracker = new LoginLockoutTracker();
        var authService = new AuthService(db, new PasswordHasher<User>(), jwtService, lockoutTracker);

        var result = await authService.LoginAsync(new LoginRequest("docente_login", "pass12345"));

        Assert.Equal(LoginStatus.Success, result.Status);
        Assert.NotNull(result.Response);
        Assert.NotEmpty(result.Response.Token);
        Assert.Equal("docente_login", result.Response.User.Username);
        Assert.Equal("TEACHER", result.Response.User.Role);
        Assert.Equal("Profesor Juan", result.Response.User.FullName);
        Assert.Equal(user.InstitutionId, result.Response.User.InstitutionId);

        // Validar claims del JWT
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(result.Response.Token);
        Assert.Equal(user.Id.ToString(), jwt.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal("TEACHER", jwt.Claims.First(c => c.Type == "role" || c.Type == ClaimTypes.Role).Value);
        Assert.Equal(user.InstitutionId.ToString(), jwt.Claims.First(c => c.Type == "institution_id").Value);
    }

    [Fact]
    public async Task Login_WithValidAuxiliaryCredentials_ReturnsJwtWithAuxiliaryRole()
    {
        await using var db = fx.CreateContext();
        var (user, _) = await CreateUserAsync(db, "auxiliar_login", "auxpass123", UserRole.Auxiliary);

        var config = CreateConfig();
        var jwtService = new JwtTokenService(config);
        var lockoutTracker = new LoginLockoutTracker();
        var authService = new AuthService(db, new PasswordHasher<User>(), jwtService, lockoutTracker);

        var result = await authService.LoginAsync(new LoginRequest("auxiliar_login", "auxpass123"));

        Assert.Equal(LoginStatus.Success, result.Status);
        Assert.NotNull(result.Response);
        Assert.Equal("AUXILIARY", result.Response.User.Role);

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(result.Response.Token);
        Assert.Equal("AUXILIARY", jwt.Claims.First(c => c.Type == "role" || c.Type == ClaimTypes.Role).Value);
    }

    [Fact]
    public async Task Login_WithValidAdminCredentials_ReturnsJwtWithAdminRole()
    {
        await using var db = fx.CreateContext();
        var (user, _) = await CreateUserAsync(db, "admin_login", "adminpass123", UserRole.Admin);

        var config = CreateConfig();
        var jwtService = new JwtTokenService(config);
        var lockoutTracker = new LoginLockoutTracker();
        var authService = new AuthService(db, new PasswordHasher<User>(), jwtService, lockoutTracker);

        var result = await authService.LoginAsync(new LoginRequest("admin_login", "adminpass123"));

        Assert.Equal(LoginStatus.Success, result.Status);
        Assert.NotNull(result.Response);
        Assert.Equal("ADMIN", result.Response.User.Role);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsInvalidCredentials()
    {
        await using var db = fx.CreateContext();
        await CreateUserAsync(db, "user_wrong_pass", "correct_pass", UserRole.Teacher);

        var config = CreateConfig();
        var jwtService = new JwtTokenService(config);
        var lockoutTracker = new LoginLockoutTracker();
        var authService = new AuthService(db, new PasswordHasher<User>(), jwtService, lockoutTracker);

        var result = await authService.LoginAsync(new LoginRequest("user_wrong_pass", "wrong_pass_attempt"));

        Assert.Equal(LoginStatus.InvalidCredentials, result.Status);
        Assert.Null(result.Response);
    }

    [Fact]
    public async Task Login_WithNonExistentUser_ReturnsInvalidCredentials()
    {
        await using var db = fx.CreateContext();
        var config = CreateConfig();
        var jwtService = new JwtTokenService(config);
        var lockoutTracker = new LoginLockoutTracker();
        var authService = new AuthService(db, new PasswordHasher<User>(), jwtService, lockoutTracker);

        var result = await authService.LoginAsync(new LoginRequest("usuario_inexistente", "cualquier_pass"));

        Assert.Equal(LoginStatus.InvalidCredentials, result.Status);
        Assert.Null(result.Response);
    }

    [Fact]
    public async Task Login_AfterFiveFailedAttempts_LocksOutAccountTemporarily()
    {
        await using var db = fx.CreateContext();
        await CreateUserAsync(db, "user_to_lockout", "secret12345", UserRole.Teacher);

        var config = CreateConfig();
        var jwtService = new JwtTokenService(config);
        var lockoutTracker = new LoginLockoutTracker();
        var authService = new AuthService(db, new PasswordHasher<User>(), jwtService, lockoutTracker);

        // 4 intentos fallidos retornan InvalidCredentials
        for (int i = 0; i < 4; i++)
        {
            var failedResult = await authService.LoginAsync(new LoginRequest("user_to_lockout", "bad_password"));
            Assert.Equal(LoginStatus.InvalidCredentials, failedResult.Status);
            Assert.Null(failedResult.Response);
        }

        // 5to intento fallido activa el bloqueo temporal
        var fifthAttempt = await authService.LoginAsync(new LoginRequest("user_to_lockout", "bad_password"));
        Assert.Equal(LoginStatus.LockedOut, fifthAttempt.Status);
        Assert.Null(fifthAttempt.Response);

        // 6to intento (incluso con la contraseña correcta): debe estar bloqueado
        var lockedResult = await authService.LoginAsync(new LoginRequest("user_to_lockout", "secret12345"));
        Assert.Equal(LoginStatus.LockedOut, lockedResult.Status);
        Assert.Null(lockedResult.Response);
        Assert.NotNull(lockedResult.ErrorMessage);
        Assert.Contains("bloqueada temporalmente", lockedResult.ErrorMessage);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("short")]
    [InlineData("secret123")]
    [InlineData("development-secret")]
    [InlineData("changeme")]
    [InlineData(JwtTokenService.DefaultKey)]
    public void ValidateJwtSecret_InNonDevelopment_WithInsecureOrMissingKey_ThrowsInvalidOperationException(string? badKey)
    {
        // Requisito 5: En entornos no-desarrollo, JWT_SECRET es obligatorio, >= 32 chars y no defaults inseguros
        var ex = Assert.Throws<InvalidOperationException>(() =>
            JwtTokenService.ValidateJwtSecret(badKey, isDevelopment: false));
        Assert.Contains("JWT_SECRET no configurado o inseguro", ex.Message);
    }

    [Fact]
    public void ValidateJwtSecret_InNonDevelopment_WithSecureKey_DoesNotThrow()
    {
        // Requisito 5: Clave >= 32 caracteres y no por defecto se acepta correctamente fuera de desarrollo
        var secureKey = "esta_es_una_clave_de_produccion_muy_segura_de_mas_de_32_bytes";
        JwtTokenService.ValidateJwtSecret(secureKey, isDevelopment: false);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("short")]
    [InlineData(JwtTokenService.DefaultKey)]
    public void ValidateJwtSecret_InDevelopment_DoesNotThrow(string? devKey)
    {
        // En desarrollo se permite clave nula o por defecto para facilidad de pruebas locales
        JwtTokenService.ValidateJwtSecret(devKey, isDevelopment: true);
    }
}
