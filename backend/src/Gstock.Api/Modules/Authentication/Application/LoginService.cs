using Gstock.Api.Modules.Authentication.Infrastructure;

namespace Gstock.Api.Modules.Authentication.Application;

internal sealed record LoginInput(string? Email, string? Password, bool RememberMe = false);
internal sealed record LoginResponse(string AccessToken, string TokenType, int ExpiresIn);
internal sealed record SignedIn(LoginResponse Response, RefreshGrant Grant);

internal sealed class LoginService(
    ILoginRepository repository, Argon2idPasswordVerifier passwordVerifier, AccessTokenIssuer tokens)
{
    public async Task<SignedIn?> SignInAsync(LoginInput input, CancellationToken cancellationToken)
    {
        var email = input.Email?.Trim();
        var password = input.Password;
        if (email is null || email.Length is < 1 or > 254 || email.Contains('\0') ||
            password is null || password.Length is < 1 or > 128 || password.Contains('\0'))
        {
            return null;
        }

        var credential = await repository.FindActiveCredentialAsync(email, cancellationToken);
        if (!passwordVerifier.Verify(password, credential?.PasswordHash) || credential is null)
        {
            return null;
        }
        cancellationToken.ThrowIfCancellationRequested();

        var sessionId = Guid.NewGuid();
        var issuedAt = DateTimeOffset.UtcNow;
        var window = RefreshSecrets.Window(issuedAt, input.RememberMe);
        var refresh = RefreshSecrets.Create(input.RememberMe ? window.AbsoluteExpiry : null);
        var accessToken = tokens.Issue(credential.EmployeeId, sessionId, issuedAt);
        if (!await repository.TryCreateSessionAsync(credential, email, sessionId, issuedAt, input.RememberMe,
            window, refresh, cancellationToken))
        {
            return null;
        }
        return new SignedIn(new LoginResponse(accessToken, "Bearer", AccessTokenIssuer.LifetimeSeconds), refresh);
    }
}
