using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;

namespace Gstock.backend.Modules.Authentication.Domain;

internal static class PasswordPolicy
{
    public static void ValidateNewPassword(string? password)
    {
        if (password is null || password.Length is < 8 or > 128)
        {
            throw new GstockApplicationException(
                ErrorCodes.ValidationFailed, "Enter a password between 8 and 128 characters.", "password");
        }
    }
}
