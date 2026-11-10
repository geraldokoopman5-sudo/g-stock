using Gstock.Contracts.Common;
using Gstock.backend.Modules.Authentication.Domain;

namespace Gstock.backend.Modules.Authentication.Application;

internal interface ICredentialRepository
{
    Task<EmployeeCredential?> FindByEmployeeIdAsync(
        Guid employeeId, IUnitOfWork work, CancellationToken cancellationToken);

    Task InsertAsync(
        EmployeeCredential credential, IUnitOfWork work, CancellationToken cancellationToken);
}
