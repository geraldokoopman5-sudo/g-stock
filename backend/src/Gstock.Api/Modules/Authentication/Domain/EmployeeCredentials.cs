namespace Gstock.Api.Modules.Authentication.Domain;

public sealed class EmployeeCredentials
{
    public required Guid EmployeeId{get; init;}
    public required string PasswordHash{get; set;}
}