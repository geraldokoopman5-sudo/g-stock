using Gstock.Contracts.Common;

namespace Gstock.Contracts.Employees;

public interface IEmployeeDirectory
{
    Task<EmployeeSnapshot?> FindByIdAsync(
        Guid employeeId,
        CancellationToken cancellationToken = default);

    Task<EmployeeSnapshot?> FindByEmailForUpdateAsync(
        string email,
        IUnitOfWork work,
        CancellationToken cancellationToken = default);

    Task<EmployeeSnapshot?> FindByIdForUpdateAsync(
        Guid employeeId,
        IUnitOfWork work,
        CancellationToken cancellationToken = default);
}
