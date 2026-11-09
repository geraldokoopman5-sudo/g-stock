using System.Diagnostics;
using Gstock.backend.Shared.Observability;

namespace Gstock.backend.App.Http;

public sealed class RequestLoggingMiddleware(
    RequestDelegate next,
    ILogger<RequestLoggingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var startedAt = Stopwatch.GetTimestamp();
        var route = LogRedaction.RouteTemplate(context);
        var method = LogRedaction.RequestMethod(context.Request.Method);

        await next(context);

        logger.LogInformation(
            "{Method} {Route} returned {StatusCode} in {ElapsedMs:F1} ms",
            method, route, context.Response.StatusCode,
            Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds);
    }
}
