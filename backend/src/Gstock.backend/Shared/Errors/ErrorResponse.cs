using System.Text.Json.Serialization;

namespace Gstock.backend.Shared.Errors;

public sealed record ErrorResponse(ErrorDetails Error);

public sealed record ErrorDetails(
    string Code,
    string Message,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? Field = null
);