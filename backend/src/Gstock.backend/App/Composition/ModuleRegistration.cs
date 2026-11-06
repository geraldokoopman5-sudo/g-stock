using Microsoft.Extensions.DependencyInjection;

namespace Gstock.backend.App.Composition.ModuleRegistration;

public static class ModuleRegistration
{
    public static IServiceCollection AddModules(
        this IServiceCollection services
    )
    {
        return services;
    }
}
//Will be used later for Auth, Employees and other modules