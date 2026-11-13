namespace Gstock.Api.Modules.Authentication.Domain;

public sealed class AuthSession
{
    public required Guid Id{get; init;}
    public required Guid EmployeeId{get; init;}
    public required bool RememberMe{get; init;}
    public required DateTime CreatedAt{get; init;}
    public required DateTime LastRefreshedAt{get; set;}
    public required DateTime AbsoluteExpiresAt{get; init;}
    public required DateTime IdleExpiresAt{get; set;}
    public required DateTime? RevokedAt{get; init;}
    public required string RevokedReason{get; set;}
}