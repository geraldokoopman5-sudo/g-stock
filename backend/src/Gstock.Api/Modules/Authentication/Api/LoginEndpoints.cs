using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using Gstock.Api.Modules.Authentication.Application;
using Gstock.Api.Modules.Authentication.Infrastructure;
using Microsoft.AspNetCore.Mvc;

namespace Gstock.Api.Modules.Authentication.Api;

internal static class LoginEndpoints
{
    private const string RateLimitPolicy = "employee-login";

    public static void AddGstockLogin(this IServiceCollection services)
    {
        services.AddScoped<ILoginRepository, PostgresLoginRepository>();
        services.AddSingleton<Argon2idPasswordVerifier>();
        services.AddSingleton<AccessTokenIssuer>();
        services.AddScoped<LoginService>();
        services.AddScoped<RefreshService>();
        services.AddScoped<PostgresRefreshRepository>();
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("employee-refresh", context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 120,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));
            options.AddPolicy(RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));
        });
    }

    public static void MapLoginEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/v1/auth/login", LoginAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicy);
    }

    private static async Task<IResult> LoginAsync(
        LoginInput input,
        [FromServices] LoginService login,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        AuthSessionEndpoints.RequireSameOrigin(context);
        context.Response.Headers.CacheControl = "no-store";

        var signedIn = await login.SignInAsync(input, cancellationToken);
        if (signedIn is null)
        {
            return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, detail: "Invalid email or password.");
        }

        AuthSessionEndpoints.SetCookie(context, signedIn.Grant);
        return Results.Ok(signedIn.Response);
    }
}
