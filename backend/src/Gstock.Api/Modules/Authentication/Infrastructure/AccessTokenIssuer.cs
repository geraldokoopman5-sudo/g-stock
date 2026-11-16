using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Gstock.Api.Modules.Authentication.Infrastructure;

internal sealed class AccessTokenIssuer(IConfiguration configuration)
{
    internal const int LifetimeSeconds = 600;
    internal const string DefaultAudience = "gstock-api";
    internal const string TokenType = "at+jwt";

    public string Issue(Guid employeeId, Guid sessionId, DateTimeOffset issuedAt)
    {
        var auth = configuration.GetSection("Auth");
        var issuer = Required(auth, "Issuer");
        var keyId = Required(auth, "SigningKeyId");
        var publicKeySection = auth.GetSection("SigningKeys").GetChildren()
            .SingleOrDefault(key => string.Equals(key.Key, keyId, StringComparison.Ordinal))
            ?? throw new InvalidOperationException("The active JWT signing key ID has no trusted public key.");
        var publicKey = ReadPublicKey(publicKeySection);

        using var rsa = RSA.Create();
        rsa.ImportFromPem(Required(auth, "PrivateKeyPem"));
        var publicParameters = rsa.ExportParameters(false);
        if (!publicParameters.Modulus.AsSpan().SequenceEqual(publicKey.Parameters.Modulus) ||
            !publicParameters.Exponent.AsSpan().SequenceEqual(publicKey.Parameters.Exponent))
        {
            throw new InvalidOperationException("The JWT signing key does not match its configured public key.");
        }

        var signingKey = new RsaSecurityKey(rsa)
        {
            KeyId = keyId,
            CryptoProviderFactory = new CryptoProviderFactory { CacheSignatureProviders = false }
        };

        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = auth["Audience"] ?? DefaultAudience,
            TokenType = TokenType,
            SigningCredentials = new SigningCredentials(signingKey, SecurityAlgorithms.RsaSha256),
            IssuedAt = issuedAt.UtcDateTime,
            NotBefore = issuedAt.UtcDateTime,
            Expires = issuedAt.AddSeconds(LifetimeSeconds).UtcDateTime,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = employeeId.ToString(),
                ["sid"] = sessionId.ToString(),
                ["jti"] = Guid.NewGuid().ToString()
            }
        });
    }

    internal static RsaSecurityKey ReadPublicKey(IConfigurationSection section)
    {
        var pem = section.Value ?? throw new InvalidOperationException($"Missing public key for '{section.Key}'.");
        if (!pem.TrimStart().StartsWith("-----BEGIN PUBLIC KEY-----", StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Signing key '{section.Key}' must be a PEM public key.");
        }

        using var rsa = RSA.Create();
        rsa.ImportFromPem(pem);
        if (rsa.KeySize < 2048)
        {
            throw new InvalidOperationException($"Signing key '{section.Key}' must be at least 2048 bits.");
        }

        return new RsaSecurityKey(rsa.ExportParameters(false)) { KeyId = section.Key };
    }

    private static string Required(IConfigurationSection section, string key) =>
        section[key] is { } value && !string.IsNullOrWhiteSpace(value)
            ? value
            : throw new InvalidOperationException($"Configure '{section.Path}:{key}' to issue access tokens.");
}
