using System.Globalization;
using System.Text;
using Gstock.backend.Modules.Authentication.Application;
using Sodium;

namespace Gstock.backend.Modules.Authentication.Infrastructure;

internal sealed class Argon2idPasswordHasher : IPasswordHasher
{
    private const int MemoryKiB = 19 * 1024;
    private const int Iterations = 3;
    private const string CurrentVersionPrefix = "$argon2id$v=19$";

    public string Hash(string password) =>
        PasswordHash.ArgonHashString(password, Iterations, MemoryKiB * 1024);

    public PasswordVerification Verify(string password, string encodedHash)
    {
        if (Encoding.UTF8.GetByteCount(encodedHash) >= 128
            || !encodedHash.StartsWith("$argon2id$", StringComparison.Ordinal)
            || encodedHash.Contains('\0')
            || !PasswordHash.ArgonHashStringVerify(encodedHash, password))
        {
            return PasswordVerification.Invalid;
        }

        if (!encodedHash.StartsWith(CurrentVersionPrefix, StringComparison.Ordinal))
        {
            return PasswordVerification.NeedsRehash;
        }

        // Libsodium verifies the encoded parameters before we inspect their costs.
        var costs = encodedHash.Split('$')[3].Split(',');
        var memory = int.Parse(costs[0].AsSpan(2), NumberStyles.None, CultureInfo.InvariantCulture);
        var iterations = int.Parse(costs[1].AsSpan(2), NumberStyles.None, CultureInfo.InvariantCulture);

        return memory < MemoryKiB || iterations < Iterations
            ? PasswordVerification.NeedsRehash
            : PasswordVerification.Valid;
    }
}
