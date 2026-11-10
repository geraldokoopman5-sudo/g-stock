namespace Gstock.backend.Modules.Authentication.Application;

internal enum PasswordVerification
{
    Invalid,
    Valid,
    NeedsRehash
}

internal interface IPasswordHasher
{
    string Hash(string password);
    PasswordVerification Verify(string password, string encodedHash);
}
