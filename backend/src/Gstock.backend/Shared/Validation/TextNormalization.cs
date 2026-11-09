using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;

namespace Gstock.backend.Shared.Validation;

public static class TextNormalization
{
    public static string? Optional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static string Required(string? value, string field) =>
        Optional(value) ?? throw new GstockApplicationException(
            ErrorCodes.ValidationFailed, "Enter a value.", field);

    public static string? CatalogKey(string? value)
    {
        var text = Optional(value);
        if (text is null)
        {
            return null;
        }

        var words = text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", words).ToLowerInvariant();
    }
}