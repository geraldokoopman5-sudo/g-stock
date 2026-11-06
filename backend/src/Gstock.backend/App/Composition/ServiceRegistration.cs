// TODO: Add application-wide service registrations here.
using Microsoft.Extensions.DependencyInjection;
using Npgsql.Replication;

namespace Gstock.backend.App.Composition;
public static class ServiceRegistration
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services)
    {
        services.AddHealthChecks();

        return services;
    }
}