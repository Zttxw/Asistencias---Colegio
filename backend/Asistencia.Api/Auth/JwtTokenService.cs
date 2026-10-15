using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Asistencia.Api.Domain;
using Microsoft.IdentityModel.Tokens;

namespace Asistencia.Api.Auth;

public sealed class JwtTokenService(IConfiguration config)
{
    public const string DefaultKey = "asistencia_super_secret_dev_key_2026_at_least_32_bytes!";
    public const string DefaultIssuer = "asistencia-api";
    public const string DefaultAudience = "asistencia-app";

    public static readonly string[] InsecureDefaults =
    [
        "secret123",
        "development-secret",
        "changeme",
        DefaultKey
    ];

    public static void ValidateJwtSecret(string? jwtKey, bool isDevelopment)
    {
        if (isDevelopment) return;

        if (string.IsNullOrWhiteSpace(jwtKey) ||
            jwtKey.Length < 32 ||
            InsecureDefaults.Any(d => string.Equals(jwtKey, d, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException("JWT_SECRET no configurado o inseguro en entorno no-Development.");
        }
    }

    public (string Token, DateTime ExpiresAt) GenerateToken(User user, string? fullName)
    {
        var key = config["Jwt:Key"] ?? DefaultKey;
        var issuer = config["Jwt:Issuer"] ?? DefaultIssuer;
        var audience = config["Jwt:Audience"] ?? DefaultAudience;
        var expiresHours = config.GetValue("Jwt:ExpiresHours", 8);

        var expiresAt = DateTime.UtcNow.AddHours(expiresHours);
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Role, user.Role.ToString().ToUpperInvariant()),
            new("institution_id", user.InstitutionId.ToString())
        };

        if (!string.IsNullOrWhiteSpace(fullName))
        {
            claims.Add(new("full_name", fullName));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expiresAt,
            Issuer = issuer,
            Audience = audience,
            SigningCredentials = credentials
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var securityToken = tokenHandler.CreateToken(tokenDescriptor);
        var tokenString = tokenHandler.WriteToken(securityToken);

        return (tokenString, expiresAt);
    }
}
