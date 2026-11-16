using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Gstock.Api.Modules.Authentication.Application;

internal sealed record RefreshGrant(Guid Id, string Value, string Hash, DateTimeOffset? CookieExpires);
internal sealed record SessionWindow(DateTimeOffset AbsoluteExpiry, DateTimeOffset IdleExpiry);

internal static class RefreshSecrets
{
    public static SessionWindow Window(DateTimeOffset now, bool rememberMe) =>
        new(now + (rememberMe ? TimeSpan.FromDays(30) : TimeSpan.FromHours(8)),
            now + (rememberMe ? TimeSpan.FromDays(7) : TimeSpan.FromHours(1)));

    public static RefreshGrant Create(DateTimeOffset? cookieExpires)
    {
        var value = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return new RefreshGrant(Guid.NewGuid(), value, Hash(value), cookieExpires);
    }

    public static bool IsValidValue(string? value) => value is { Length: 43 } &&
        value.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');

    public static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.ASCII.GetBytes(value)));
    public static string Csrf(string value) => Hash("gstock:csrf:" + value);

    public static bool MatchesCsrf(string value, string submitted) => submitted.Length == 64 &&
        CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(Csrf(value)), Encoding.UTF8.GetBytes(submitted));
}
