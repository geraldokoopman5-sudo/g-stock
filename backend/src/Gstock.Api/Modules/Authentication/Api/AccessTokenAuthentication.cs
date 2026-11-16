using System.Globalization;
using System.Security.Claims;
using Gstock.Api.Modules.Authentication.Infrastructure;
using Gstock.Api.Modules.Authentication.Application;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Gstock.Api.Modules.Authentication.Api;

internal static class AccessTokenAuthentication
{
    private const int ClockSkewSeconds = 30;

    public static void AddGstockAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var auth = configuration.GetSection("Auth");

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                var signingKeys = auth.GetSection("SigningKeys").GetChildren()
                    .ToDictionary(key => key.Key, AccessTokenIssuer.ReadPublicKey, StringComparer.Ordinal);

                options.MapInboundClaims = false;
                options.IncludeErrorDetails = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = auth["Issuer"],
                    ValidAudience = auth["Audience"] ?? AccessTokenIssuer.DefaultAudience,
                    ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
                    ValidTypes = [AccessTokenIssuer.TokenType],
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    IgnoreTrailingSlashWhenValidatingAudience = false,
                    ValidateIssuerSigningKey = true,
                    RequireSignedTokens = true,
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    ClockSkew = TimeSpan.FromSeconds(ClockSkewSeconds),
                    TryAllIssuerSigningKeys = false,
                    IssuerSigningKeyResolver = (_, _, keyId, _) =>
                        keyId is not null && signingKeys.TryGetValue(keyId, out var key) ? [key] : []
                };
                options.Events = new JwtBearerEvents { OnTokenValidated = ValidateSessionAsync };
            });

        services.AddAuthorization();
    }

    private static async Task ValidateSessionAsync(TokenValidatedContext context)
    {
        var principal = context.Principal;
        if (principal is null || !Guid.TryParse(principal.FindFirstValue("sub"), out var employeeId) || employeeId == Guid.Empty ||
            !Guid.TryParse(principal.FindFirstValue("sid"), out var sessionId) || sessionId == Guid.Empty ||
            string.IsNullOrWhiteSpace(principal.FindFirstValue("jti")) ||
            !HasValidIssuedAt(principal, context.SecurityToken.ValidTo))
        {
            context.Fail("The access token has invalid claims.");
            return;
        }

        var sessions = context.HttpContext.RequestServices.GetRequiredService<IAuthSessionRepository>();
        var session = await sessions.FindActiveAsync(
            sessionId, employeeId, context.HttpContext.RequestAborted);

        if (session is null)
        {
            context.Fail("The sign-in session is no longer valid.");
        }
    }

    private static bool HasValidIssuedAt(ClaimsPrincipal principal, DateTime expiresAt)
    {
        var latestIssuedAt = DateTimeOffset.UtcNow.AddSeconds(ClockSkewSeconds).ToUnixTimeSeconds();
        var expires = new DateTimeOffset(expiresAt).ToUnixTimeSeconds();

        return long.TryParse(
                   principal.FindFirstValue("iat"), NumberStyles.None, CultureInfo.InvariantCulture, out var issued) &&
               issued <= latestIssuedAt && issued < expires && expires - issued <= AccessTokenIssuer.LifetimeSeconds;
    }
}
