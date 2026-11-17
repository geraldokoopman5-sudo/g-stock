using System.Security.Claims;
using Gstock.Api.Modules.Authentication.Application;
using Gstock.Api.Modules.Authentication.Infrastructure;
using Gstock.Api.Modules.Employees.Api;
using Gstock.Api.Modules.Employees.Infrastructure;
using Gstock.Api.Shared.Api;
using Gstock.Contracts;
using Microsoft.AspNetCore.Mvc;

namespace Gstock.Api.Modules.Authentication.Api;

internal static class AuthSessionEndpoints
{
    private const string CookieName = "gstock_refresh";
    private const string CookiePath = "/api/v1/auth";

    public static void MapAuthSessionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var auth = endpoints.MapGroup(CookiePath);
        auth.MapGet("/csrf", CsrfAsync);
        auth.MapPost("/refresh", RefreshAsync).RequireRateLimiting("employee-refresh");
        auth.MapPost("/logout", LogoutAsync);
        auth.MapPost("/logout-all", LogoutAllAsync).RequireAuthorization();
        auth.MapGet("/me", async (ClaimsPrincipal user, HttpContext context,
            [FromServices] PostgresEmployeeRepository employees, CancellationToken token) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var profile = await EmployeeEndpoints.FindAsync(employees, user.EmployeeId(), token);
            return Results.Ok(new
            {
                profile,
                permissions = new
                {
                    canCreateWarehouse = profile.Status == AccountStatus.Active,
                    canManageBrands = profile.AccountRole == AccountRoles.StockManager,
                    canManageItems = profile.AccountRole == AccountRoles.Nemployee,
                    canManageEmployees = profile.AccountRole == AccountRoles.StaffManager
                }
            });
        }).RequireAuthorization();
    }

    private static async Task<IResult> CsrfAsync(
        HttpContext context, [FromServices] PostgresRefreshRepository repository, CancellationToken token)
    {
        RequireSameOrigin(context);
        context.Response.Headers.CacheControl = "no-store";
        var value = context.Request.Cookies[CookieName];
        return RefreshSecrets.IsValidValue(value) && await repository.CanBootstrapAsync(RefreshSecrets.Hash(value!), token)
            ? Results.Ok(new { csrfToken = RefreshSecrets.Csrf(value!) })
            : Results.Unauthorized();
    }

    private static async Task<IResult> RefreshAsync(
        HttpContext context, [FromServices] RefreshService refresh, CancellationToken token)
    {
        RequireSameOrigin(context);
        context.Response.Headers.CacheControl = "no-store";
        var value = context.Request.Cookies[CookieName];
        if (!RefreshSecrets.IsValidValue(value))
        {
            ClearCookie(context);
            return Results.Unauthorized();
        }

        RequireCsrf(context, value!);
        var signedIn = await refresh.RotateAsync(value!, token);
        if (signedIn is null)
        {
            ClearCookie(context);
            return Results.Unauthorized();
        }
        SetCookie(context, signedIn.Grant);
        return Results.Ok(signedIn.Response);
    }

    private static async Task<IResult> LogoutAsync(
        HttpContext context, [FromServices] PostgresRefreshRepository repository, CancellationToken token)
    {
        RequireSameOrigin(context);
        var value = context.Request.Cookies[CookieName];
        if (RefreshSecrets.IsValidValue(value))
        {
            RequireCsrf(context, value!);
            await repository.LogoutByTokenAsync(RefreshSecrets.Hash(value!), token);
        }
        else if (context.User.Identity?.IsAuthenticated == true &&
                 Guid.TryParse(context.User.FindFirstValue("sid"), out var id))
        {
            await repository.LogoutAsync(context.User.EmployeeId(), id, token);
        }
        ClearCookie(context);
        return Results.NoContent();
    }

    private static async Task<IResult> LogoutAllAsync(
        HttpContext context, [FromServices] PostgresRefreshRepository repository, CancellationToken token)
    {
        RequireSameOrigin(context);
        if (context.Request.Cookies[CookieName] is { } value && RefreshSecrets.IsValidValue(value))
        {
            RequireCsrf(context, value);
        }
        await repository.LogoutAllAsync(context.User.EmployeeId(), token);
        ClearCookie(context);
        return Results.NoContent();
    }

    internal static void RequireSameOrigin(HttpContext context)
    {
        var request = context.Request;
        var site = request.Headers["Sec-Fetch-Site"].ToString();
        var origin = request.Headers.Origin.ToString();
        var host = $"{request.Scheme}://{request.Host.ToUriComponent()}";
        if (site is not ("" or "same-origin" or "none") ||
            (origin.Length > 0 && (!Uri.TryCreate(origin, UriKind.Absolute, out var submitted) ||
                !Uri.TryCreate(host, UriKind.Absolute, out var expected) ||
                !string.Equals(submitted.AbsoluteUri, expected.AbsoluteUri, StringComparison.OrdinalIgnoreCase))))
        {
            throw new ApiError(403, "This request must come from the API's origin.");
        }
    }

    private static void RequireCsrf(HttpContext context, string value)
    {
        if (!RefreshSecrets.MatchesCsrf(value, context.Request.Headers["X-CSRF-Token"].ToString()))
        {
            throw new ApiError(403, "The refresh request needs a valid CSRF token.");
        }
    }

    internal static void SetCookie(HttpContext context, RefreshGrant refresh) =>
        context.Response.Cookies.Append(CookieName, refresh.Value, CookieSettings(refresh.CookieExpires));

    private static void ClearCookie(HttpContext context) =>
        context.Response.Cookies.Delete(CookieName, CookieSettings(null));

    private static CookieOptions CookieSettings(DateTimeOffset? expires) => new()
    {
        Secure = true, HttpOnly = true, SameSite = SameSiteMode.Strict, Path = CookiePath, Expires = expires
    };
}
