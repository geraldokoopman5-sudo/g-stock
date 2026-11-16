using System.Net.Mail;
using System.Text;
using Gstock.Api.Modules.Authentication.Infrastructure;
using Gstock.Api.Modules.Employees.Infrastructure;
using Gstock.Contracts;
using Npgsql;

namespace Gstock.Api.App.Administration;

internal static class ProvisionDevelopmentEmployee
{
    internal const string StockManagerCommand = "--provision-dev-stock-manager";
    internal const string StaffManagerCommand = "--provision-dev-staff-manager";

    public static async Task<int> RunAsync(NpgsqlDataSource dataSource, AccountRoles role)
    {
        if (Console.IsInputRedirected)
        {
            Console.Error.WriteLine("Run Development employee provisioning from an interactive terminal.");
            return 2;
        }

        var roleName = EmployeeRoleMapping.Write(role);
        Console.Write($"Development {roleName} email: ");
        var email = Console.ReadLine()?.Trim();
        if (email is null || email.Length > 254 ||
            !MailAddress.TryCreate(email, out var address) ||
            !string.Equals(email, address.Address, StringComparison.Ordinal))
        {
            Console.Error.WriteLine("Enter a valid employee email address.");
            return 2;
        }

        var password = ReadPassword("Password");
        if (password.Length is < 8 or > 128)
        {
            Console.Error.WriteLine("Enter a password between 8 and 128 characters.");
            return 2;
        }

        if (!string.Equals(password, ReadPassword("Confirm password"), StringComparison.Ordinal))
        {
            Console.Error.WriteLine("Passwords do not match.");
            return 2;
        }

        const string sql = """
            WITH new_employee AS (
                INSERT INTO public.employees (id, employee_id, full_name, email, account_role, role)
                VALUES (@id, @employee_number, @name, @email, CAST(@role AS public.account_role), @role)
                ON CONFLICT DO NOTHING
                RETURNING id
            )
            INSERT INTO public.employee_credentials (employee_id, password_hash)
            SELECT id, @password_hash FROM new_employee
            RETURNING employee_id;
            """;

        try
        {
            var employeeId = Guid.NewGuid();
            await using var command = dataSource.CreateCommand(sql);
            command.Parameters.AddWithValue("id", employeeId);
            command.Parameters.AddWithValue("employee_number", $"DEV-{employeeId:N}"[..24]);
            command.Parameters.AddWithValue("email", email);
            command.Parameters.AddWithValue("role", roleName);
            command.Parameters.AddWithValue("name", $"Development {roleName}");
            command.Parameters.AddWithValue("password_hash", Argon2idPasswordVerifier.Hash(password));

            if (await command.ExecuteScalarAsync() is not Guid)
            {
                Console.Error.WriteLine("An employee with this email or employee number already exists.");
                return 2;
            }

            Console.WriteLine($"Created development {roleName} {email}.");
            return 0;
        }
        catch (PostgresException exception)
        {
            Console.Error.WriteLine($"Development employee provisioning failed in PostgreSQL (SQLSTATE {exception.SqlState}).");
            return 1;
        }
        catch (NpgsqlException)
        {
            Console.Error.WriteLine("Development employee provisioning could not connect to PostgreSQL.");
            return 1;
        }
    }

    private static string ReadPassword(string prompt)
    {
        Console.Write($"{prompt}: ");
        var password = new StringBuilder();

        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            switch (key.Key)
            {
                case ConsoleKey.Enter:
                    Console.WriteLine();
                    return password.ToString();
                case ConsoleKey.Backspace when password.Length > 0:
                    password.Length--;
                    break;
                default:
                    if (!char.IsControl(key.KeyChar))
                    {
                        password.Append(key.KeyChar);
                    }
                    break;
            }
        }
    }
}
