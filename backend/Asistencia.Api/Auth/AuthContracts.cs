namespace Asistencia.Api.Auth;

public record LoginRequest(string Username, string Password);

public record UserDto(Guid Id, string Username, string Role, Guid InstitutionId, string? FullName, Guid? TeacherId = null);

public record LoginResponse(string Token, UserDto User, DateTime ExpiresAt);

public enum LoginStatus
{
    Success,
    InvalidCredentials,
    LockedOut
}

public sealed record LoginAttemptResult(
    LoginStatus Status,
    LoginResponse? Response = null,
    TimeSpan? LockoutRemaining = null,
    string? ErrorMessage = null
);
