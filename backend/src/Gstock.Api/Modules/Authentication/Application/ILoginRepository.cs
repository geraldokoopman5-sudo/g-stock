namespace Gstock.Api.Modules.Authentication.Application;

internal sealed record LoginCredential(Guid EmployeeId, string PasswordHash);

internal interface ILoginRepository
{
    Task<LoginCredential?> FindActiveCredentialAsync(string email, CancellationToken cancellationToken);
    Task<bool> TryCreateSessionAsync(LoginCredential credential, string email, Guid sessionId,
        DateTimeOffset issuedAt, bool rememberMe, SessionWindow window, RefreshGrant refresh, CancellationToken cancellationToken);
}
