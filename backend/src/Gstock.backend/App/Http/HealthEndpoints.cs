using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace Gstock.backend.App.Http.HealthEnpoints;

public static class HealthEnpoints
{
    public static IEndpointRouteBuilder MapEndpointHealth(
        this IEndpointRouteBuilder endpoints
    )
    {
        endpoints.MapHealthChecks("/health");

        return endpoints;
    }
}

//This block checks that the application can respond; 