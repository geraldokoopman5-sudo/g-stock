namespace Gstock.Contracts.Common;

public sealed record ActorSnapshot
(
    Guid EmployeeId,
    string EmployeeNumber,
    string FullName,
    string Role
);