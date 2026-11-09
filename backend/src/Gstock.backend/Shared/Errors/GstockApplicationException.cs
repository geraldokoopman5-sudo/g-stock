namespace Gstock.backend.Shared.Errors;

public sealed class GstockApplicationException : Exception
{
    public string Code{get;}

    public string? Field {get;}

    public GstockApplicationException(
        string code,
        string message,
        string? field = null)
        : base(message)
    {
        Code = code;
        Field = field;
    }

    
}