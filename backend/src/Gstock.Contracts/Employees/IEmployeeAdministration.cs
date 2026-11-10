using Gstock.Contracts.Common;

namespace Gstock.Contracts.Employees;

public sealed record EmployeeProvisionRequest(
    string EmployeeNumber,
    string FullName,
    string Email,
    string Department,
    string Role,
    EmployeeAccountPermission AccountPermission = EmployeeAccountPermission.None);

public interface IEmployeeAdministration
{
    Task<Guid> CreateAsync(
        EmployeeProvisionRequest request,
        IUnitOfWork work,
        CancellationToken cancellationToken = default);
}
