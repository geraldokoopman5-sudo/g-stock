using System.Security.Cryptography;
using System.Text;
using Sodium;

namespace Gstock.Api.Modules.Authentication.Infrastructure;

internal sealed class Argon2idPasswordVerifier
{
    private const int MemoryBytes = 19 * 1024 * 1024;
    private const int Iterations = 3;

    // Spend comparable verification work when the email has no active credential.
    private readonly string missingCredentialHash = Hash(
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));

    internal static string Hash(string password) =>
        PasswordHash.ArgonHashString(password, Iterations, MemoryBytes);

    public bool Verify(string password, string? encodedHash)
    {
        var hash = encodedHash ?? missingCredentialHash;

        return hash.StartsWith("$argon2id$", StringComparison.Ordinal) &&
               Encoding.UTF8.GetByteCount(hash) < 128 &&
               !hash.Contains('\0') &&
               PasswordHash.ArgonHashStringVerify(hash, password) &&
               encodedHash is not null;
    }
}
