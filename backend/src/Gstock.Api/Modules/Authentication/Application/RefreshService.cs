using Gstock.Api.Modules.Authentication.Infrastructure;
using Gstock.Api.Shared.Database;

namespace Gstock.Api.Modules.Authentication.Application;

internal sealed class RefreshService(
    PostgresRefreshRepository repository, PostgresUnitOfWork database, AccessTokenIssuer issuer)
{
    public Task<SignedIn?> RotateAsync(string value, CancellationToken token) =>
        database.RunAsync<SignedIn?>(async (transaction, ct) =>
        {
            var current = await repository.LockAsync(RefreshSecrets.Hash(value), transaction, ct);
            if (current is null || current.Revoked)
            {
                return null;
            }
            if (current.Consumed)
            {
                await repository.RevokeReplayAsync(current.SessionId, transaction, ct);
                // Return normally so the transaction commits the family's revocation.
                return null;
            }
            if (current.Expired)
            {
                return null;
            }

            var nextWindow = RefreshSecrets.Window(current.EffectiveNow, current.RememberMe);
            var idleExpiry = nextWindow.IdleExpiry < current.AbsoluteExpiry
                ? nextWindow.IdleExpiry : current.AbsoluteExpiry;
            var replacement = RefreshSecrets.Create(current.RememberMe ? current.AbsoluteExpiry : null);
            var access = issuer.Issue(current.EmployeeId, current.SessionId, current.EffectiveNow);
            await repository.RotateAsync(current, replacement, idleExpiry, transaction, ct);
            return new SignedIn(new LoginResponse(access, "Bearer", AccessTokenIssuer.LifetimeSeconds), replacement);
        }, token);
}
