namespace Gstock.backend.App.Configuration;

public sealed class AuthOptions
{
    public string Issuer { get; init; } = string.Empty;
    public string Audience { get; init; } = "gstock-api";
    public TimeSpan AccessTokenLifetime { get; init; } = TimeSpan.FromMinutes(10);
    public TimeSpan SessionLifetime { get; init; } = TimeSpan.FromHours(8);
    public TimeSpan SessionIdleLimit { get; init; } = TimeSpan.FromHours(1);
    public TimeSpan RememberMeLifetime { get; init; } = TimeSpan.FromDays(30);
    public TimeSpan RememberMeIdleLimit { get; init; } = TimeSpan.FromDays(7);
}
