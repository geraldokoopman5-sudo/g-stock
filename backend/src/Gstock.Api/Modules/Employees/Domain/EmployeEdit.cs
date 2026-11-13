namespace Gstock.Api.Modules.Employees.Domani;

public sealed class EmployeeEdits
{
    public required Guid Id{get; init;}
    public required Guid TargetEmployeeId{get; init;}
    public required Guid EditedById{get; init;}
    public required string EditorFullName{get; init;}
    public required string EditorRole{get; init;}
    public required DateTime EditedAt{get; init;}
}