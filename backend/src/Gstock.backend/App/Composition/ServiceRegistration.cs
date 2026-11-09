using Gstock.Contracts.Common;
using Gstock.backend.Shared.Time;
using Gstock.backend.Shared.Ids;
using Gstock.backend.Shared.Identity;
using Gstock.backend.App.Configuration;
using Gstock.backend.App.Http;
using Gstock.backend.Shared.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Gstock.backend.App.Composition;
public static class ServiceRegistration
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddHealthChecks();
        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IIdGenerator, UuidGenerator>();
        services.AddHttpContextAccessor();
        services.AddScoped<IRequestIdentity, CurrentRequestIdentity>();
        services.AddOptions<DatabaseOptions>()
            .Bind(configuration.GetSection("Database"))
            .Validate(options => !string.IsNullOrWhiteSpace(options.ConnectionString),
                "Set Database:ConnectionString.")
            .ValidateOnStart();
        services.Configure<AuthOptions>(configuration.GetSection("Auth"));
        services.Configure<OriginOptions>(configuration.GetSection("Origins"));

        services.AddSingleton(provider =>
        {
            var options = provider.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            return NpgsqlDataSource.Create(options.ConnectionString);
        });
        services.AddSingleton<PostgresConnectionFactory>();
        services.AddSingleton<SqlReadExecutor>();

        services.AddProblemDetails();
        services.AddExceptionHandler<ExceptionHandler>();

        return services;
    }
}
