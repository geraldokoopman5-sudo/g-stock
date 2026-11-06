using Gstock.Contracts.Common;
using Gstock.backend.Shared.Time;
using Microsoft.Extensions.DependencyInjection;
using Npgsql.Replication;

namespace Gstock.backend.App.Composition;
public static class ServiceRegistration
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services)
    {
        services.AddHealthChecks();
        services.AddSingleton<IClock, SystemClock>();

        return services;
    }
}