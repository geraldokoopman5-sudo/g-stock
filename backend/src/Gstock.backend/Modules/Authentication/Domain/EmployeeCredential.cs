namespace Gstock.backend.Modules.Authentication.Domain;

internal sealed class EmployeeCredential(Guid employeeId, string passwordHash, DateTimeOffset passwordChangedAt)
{
    public Guid EmployeeId { get; } = employeeId;
    public string PasswordHash { get; } = passwordHash;
    public DateTimeOffset PasswordChangedAt { get; } = passwordChangedAt;
}
