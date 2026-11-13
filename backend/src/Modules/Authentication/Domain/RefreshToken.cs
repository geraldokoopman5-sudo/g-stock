namespace Gstock.Api.Modules.Authentication.Domain;

public sealed class RefreshToken
{
    public required Guid Id{get; init;}
    public required Guid SessionId{get; init;}
    public required string  TokenHash{get; init;}
    public required DateTime CreatedAt{get; init;}
    public required DateTime ExpiresAt{get; init;}
    public required DateTime? ConsumedAt{get; init;}
    public required Guid? ReplacedByTokenId{get; set;}
}