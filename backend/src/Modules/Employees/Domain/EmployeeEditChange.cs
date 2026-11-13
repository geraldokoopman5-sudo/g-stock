namespace Gstock.Api.Modules.Employees.Domain;

public sealed class EmployeeEditChange
{
    public required Guid EditId{get; init;}
    public required string Field{get; init;}
    public required string Beforevalue{get; init;}
    public required string AfterValue{get; init;}
} 