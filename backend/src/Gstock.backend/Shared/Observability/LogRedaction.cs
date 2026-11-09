namespace Gstock.backend.Shared.Observability;

public static class LogRedaction
{
    public static string RouteTemplate(HttpContext context) =>
        (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "(unmatched)";

    public static string RequestMethod(string method) => method switch
    {
        "GET" or "POST" or "PUT" or "PATCH" or "DELETE" or "HEAD" or "OPTIONS" => method,
        _ => "OTHER"
    };
}
