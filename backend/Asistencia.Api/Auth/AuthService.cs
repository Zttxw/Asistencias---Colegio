using Asistencia.Api.Data;
using Asistencia.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Asistencia.Api.Auth;

public sealed class AuthService(
    AppDbContext db,
    IPasswordHasher<User> passwordHasher,
    JwtTokenService jwtTokenService,
    LoginLockoutTracker lockoutTracker)
{
    public async Task<LoginAttemptResult> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return new LoginAttemptResult(LoginStatus.InvalidCredentials, ErrorMessage: "Usuario y contraseña son requeridos.");
        }

        var normalizedUsername = request.Username.Trim().ToLowerInvariant();

        // 1. Verificar si la cuenta está temporalmente bloqueada por exceso de intentos fallidos (Punto 8)
        var (isLocked, remaining) = lockoutTracker.CheckLockout(normalizedUsername);
        if (isLocked)
        {
            var mins = Math.Ceiling(remaining?.TotalMinutes ?? 5);
            return new LoginAttemptResult(
                LoginStatus.LockedOut,
                LockoutRemaining: remaining,
                ErrorMessage: $"Demasiados intentos fallidos consecutivos. Cuenta bloqueada temporalmente. Intente nuevamente en {mins} minutos."
            );
        }

        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Username.ToLower() == normalizedUsername, ct);

        if (user is null)
        {
            var (nowLocked, lockRemaining) = lockoutTracker.RecordFailure(normalizedUsername);
            if (nowLocked)
            {
                return new LoginAttemptResult(LoginStatus.LockedOut, LockoutRemaining: lockRemaining, ErrorMessage: "Demasiados intentos fallidos consecutivos. Cuenta bloqueada temporalmente por 5 minutos.");
            }
            return new LoginAttemptResult(LoginStatus.InvalidCredentials, ErrorMessage: "Credenciales inválidas.");
        }

        var verificationResult = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            var (nowLocked, lockRemaining) = lockoutTracker.RecordFailure(normalizedUsername);
            if (nowLocked)
            {
                return new LoginAttemptResult(LoginStatus.LockedOut, LockoutRemaining: lockRemaining, ErrorMessage: "Demasiados intentos fallidos consecutivos. Cuenta bloqueada temporalmente por 5 minutos.");
            }
            return new LoginAttemptResult(LoginStatus.InvalidCredentials, ErrorMessage: "Credenciales inválidas.");
        }

        // Login exitoso: restablecer contador de fallos
        lockoutTracker.RecordSuccess(normalizedUsername);

        string? fullName = null;
        Guid? teacherId = null;
        if (user.Role == UserRole.Teacher)
        {
            var teacher = await db.Teachers.FirstOrDefaultAsync(t => t.UserId == user.Id, ct);
            fullName = teacher?.FullName;
            teacherId = teacher?.Id;
        }

        var (token, expiresAt) = jwtTokenService.GenerateToken(user, fullName);

        var loginResponse = new LoginResponse(
            Token: token,
            User: new UserDto(
                Id: user.Id,
                Username: user.Username,
                Role: user.Role.ToString().ToUpperInvariant(),
                InstitutionId: user.InstitutionId,
                FullName: fullName,
                TeacherId: teacherId
            ),
            ExpiresAt: expiresAt
        );

        return new LoginAttemptResult(LoginStatus.Success, Response: loginResponse);
    }
}
