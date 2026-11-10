using Gstock.Contracts.Employees;
using Gstock.backend.Modules.Employees.Application;
using Gstock.backend.Modules.Employees.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Gstock.backend.Modules.Employees;

public static class EmployeesModule
{
    public static IServiceCollection AddEmployeesModule(this IServiceCollection services)
    {
        services.AddScoped<IEmployeeRepository, PostgresEmployeeRepository>();
        services.AddScoped<IEmployeeDirectory, EmployeeDirectory>();
        services.AddScoped<IEmployeeAdministration, EmployeeAdministrationService>();

        return services;
    }
}
