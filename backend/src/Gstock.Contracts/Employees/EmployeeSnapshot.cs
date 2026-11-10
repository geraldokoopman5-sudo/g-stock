namespace Gstock.Contracts.Employees;

public enum EmployeeAccountPermission
{
    None,
    ManageEmployeeAccounts
}

public enum EmployeeAccountStatus
{
    Inactive,
    Active
}

public sealed record EmployeeSnapshot(
    Guid Id,
    string EmployeeNumber,
    string FullName,
    string Email,
    string Department,
    string Role,
    EmployeeAccountPermission AccountPermission,
    EmployeeAccountStatus AccountStatus);
