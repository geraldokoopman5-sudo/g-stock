using Gstock.Contracts.Authentication;
using Gstock.backend.Modules.Authentication.Application;
using Gstock.backend.Modules.Authentication.Infrastructure;

namespace Gstock.backend.Modules.Authentication;

public static class AuthenticationModule
{
    public static IServiceCollection AddAuthenticationModule(this IServiceCollection services)
    {
        services.AddSingleton<IPasswordHasher, Argon2idPasswordHasher>();
        services.AddScoped<ICredentialRepository, PostgresCredentialRepository>();
        services.AddScoped<ICredentialService, CredentialService>();
        return services;
    }
}
