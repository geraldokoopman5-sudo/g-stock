using Gstock.Contracts.Authentication;
using Gstock.Contracts.Common;
using Gstock.backend.Modules.Authentication.Domain;

namespace Gstock.backend.Modules.Authentication.Application;

internal sealed class CredentialService(
    ICredentialRepository repository,
    IPasswordHasher hasher,
    IClock clock) : ICredentialService
{
    public Task SetInitialPasswordAsync(
        Guid employeeId, string password, IUnitOfWork work, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        PasswordPolicy.ValidateNewPassword(password);

        var credential = new EmployeeCredential(employeeId, hasher.Hash(password), clock.UctNow);
        return repository.InsertAsync(credential, work, cancellationToken);
    }
}
