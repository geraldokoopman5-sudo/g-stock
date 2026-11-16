using Gstock.Contracts;

namespace Gstock.Api.Modules.Employees.Infrastructure;

internal static class EmployeeRoleMapping
{
    public static AccountRoles Read(string role) => role switch
    {
        "Nemployee" => AccountRoles.Nemployee,
        "Stock Manager" => AccountRoles.StockManager,
        "Staff Manager" => AccountRoles.StaffManager,
        _ => throw new InvalidOperationException("The database returned an unknown account role.")
    };

    public static string Write(AccountRoles role) => role switch
    {
        AccountRoles.Nemployee => "Nemployee",
        AccountRoles.StockManager => "Stock Manager",
        AccountRoles.StaffManager => "Staff Manager",
        _ => throw new ArgumentOutOfRangeException(nameof(role))
    };
}
