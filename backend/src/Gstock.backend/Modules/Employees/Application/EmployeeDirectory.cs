using Gstock.Contracts.Common;
using Gstock.Contracts.Employees;

namespace Gstock.backend.Modules.Employees.Application;

internal sealed class EmployeeDirectory(IEmployeeRepository repository)
    : IEmployeeDirectory
{
    public Task<EmployeeSnapshot?> FindByIdAsync(
        Guid employeeId, CancellationToken cancellationToken = default) =>
        repository.FindByIdAsync(employeeId, cancellationToken);

    public Task<EmployeeSnapshot?> FindByEmailForUpdateAsync(
        string email, IUnitOfWork work, CancellationToken cancellationToken = default) =>
        repository.FindByEmailForUpdateAsync(email.Trim(), work, cancellationToken);

    public Task<EmployeeSnapshot?> FindByIdForUpdateAsync(
        Guid employeeId, IUnitOfWork work, CancellationToken cancellationToken = default) =>
        repository.FindByIdForUpdateAsync(employeeId, work, cancellationToken);
}
