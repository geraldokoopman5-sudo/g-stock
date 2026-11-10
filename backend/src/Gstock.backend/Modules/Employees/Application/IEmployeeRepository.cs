using Gstock.Contracts.Common;
using Gstock.Contracts.Employees;

namespace Gstock.backend.Modules.Employees.Application;

internal interface IEmployeeRepository
{
    Task InsertAsync(
        EmployeeSnapshot employee, IUnitOfWork work, CancellationToken cancellationToken);

    Task<EmployeeSnapshot?> FindByIdAsync(
        Guid employeeId, CancellationToken cancellationToken);

    Task<EmployeeSnapshot?> FindByEmailForUpdateAsync(
        string email, IUnitOfWork work, CancellationToken cancellationToken);

    Task<EmployeeSnapshot?> FindByIdForUpdateAsync(
        Guid employeeId, IUnitOfWork work, CancellationToken cancellationToken);
}
