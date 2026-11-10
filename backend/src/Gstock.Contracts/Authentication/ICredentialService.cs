using Gstock.Contracts.Common;

namespace Gstock.Contracts.Authentication;

public interface ICredentialService
{
    Task SetInitialPasswordAsync(
        Guid employeeId,
        string password,
        IUnitOfWork work,
        CancellationToken cancellationToken = default);
}
