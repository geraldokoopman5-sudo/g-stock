using System.Text;
using Gstock.Contracts.Authentication;
using Gstock.Contracts.Employees;
using Gstock.backend.Shared.Persistence;

namespace Gstock.backend.App.Administration;

internal sealed class ProvisionEmployeeCommand(
    IEmployeeAdministration employees,
    ICredentialService credentials,
    PostgresConnectionFactory connections)
{
    public async Task<int> RunAsync(bool manageEmployeeAccounts)
    {
        var request = new EmployeeProvisionRequest(
            ReadText("Employee number"),
            ReadText("Full name"),
            ReadText("Email"),
            ReadText("Department"),
            ReadText("Job title"),
            manageEmployeeAccounts
                ? EmployeeAccountPermission.ManageEmployeeAccounts
                : EmployeeAccountPermission.None);

        var password = ReadPassword("Password");
        if (!string.Equals(password, ReadPassword("Confirm password"), StringComparison.Ordinal))
        {
            Console.Error.WriteLine("Passwords do not match.");
            return 2;
        }

        var employeeId = await ProvisionAsync(request, password);
        Console.WriteLine($"Provisioned employee {employeeId}.");
        return 0;
    }

    internal async Task<Guid> ProvisionAsync(EmployeeProvisionRequest request, string password)
    {
        await using var work = await PostgresUnitOfWork.BeginAsync(connections);
        var employeeId = await employees.CreateAsync(request, work);
        await credentials.SetInitialPasswordAsync(employeeId, password, work);
        await work.CommitAsync();
        return employeeId;
    }

    private static string ReadText(string label)
    {
        Console.Write($"{label}: ");
        return Console.ReadLine() ?? throw new EndOfStreamException();
    }

    private static string ReadPassword(string label)
    {
        Console.Write($"{label}: ");
        var password = new StringBuilder();

        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            switch (key.Key)
            {
                case ConsoleKey.Enter:
                    Console.WriteLine();
                    return password.ToString();
                case ConsoleKey.Backspace:
                    if (password.Length > 0)
                    {
                        password.Length--;
                    }
                    break;
                default:
                    if (key.KeyChar != '\0')
                    {
                        password.Append(key.KeyChar);
                    }
                    break;
            }
        }
    }
}
