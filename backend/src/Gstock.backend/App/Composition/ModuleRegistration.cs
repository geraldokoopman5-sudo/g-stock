using Gstock.backend.Modules.Authentication;
using Gstock.backend.Modules.Employees;
using Microsoft.Extensions.DependencyInjection;

namespace Gstock.backend.App.Composition.ModuleRegistration;

public static class ModuleRegistration
{
    public static IServiceCollection AddModules(
        this IServiceCollection services
    )
    {
        services.AddEmployeesModule();
        services.AddAuthenticationModule();
        return services;
    }
}
