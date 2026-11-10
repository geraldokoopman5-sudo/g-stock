using System.Data.Common;
using Gstock.Contracts.Common;
using Gstock.Contracts.Employees;
using Gstock.backend.Modules.Employees.Application;
using Gstock.backend.Shared.Errors;
using Gstock.backend.Shared.Persistence;
using Npgsql;

namespace Gstock.backend.Modules.Employees.Infrastructure;

internal sealed class PostgresEmployeeRepository(SqlReadExecutor reads)
    : IEmployeeRepository
{
    private const string SelectEmployee = """
        SELECT id, employee_id, full_name, email, department, role,
               account_permission::text, account_status::text
        FROM public.employees
        """;

    public async Task InsertAsync(
        EmployeeSnapshot employee, IUnitOfWork work, CancellationToken cancellationToken)
    {
        var permission = employee.AccountPermission switch
        {
            EmployeeAccountPermission.None => "none",
            EmployeeAccountPermission.ManageEmployeeAccounts => "manage_employee_accounts",
            _ => throw new InvalidOperationException("Unknown employee account permission.")
        };

        await using var command = work.Connection.CreateCommand();
        command.Transaction = work.Transaction;
        command.CommandText = """
            INSERT INTO public.employees (
                id, employee_id, full_name, email, department, role, account_permission, account_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, CAST($7 AS public.employee_account_permission), 'active')
            """;
        command.Parameters.Add(new NpgsqlParameter { Value = employee.Id });
        command.Parameters.Add(new NpgsqlParameter { Value = employee.EmployeeNumber });
        command.Parameters.Add(new NpgsqlParameter { Value = employee.FullName });
        command.Parameters.Add(new NpgsqlParameter { Value = employee.Email });
        command.Parameters.Add(new NpgsqlParameter { Value = employee.Department });
        command.Parameters.Add(new NpgsqlParameter { Value = employee.Role });
        command.Parameters.Add(new NpgsqlParameter { Value = permission });

        try
        {
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (PostgresException error) when (
            error.SqlState == PostgresErrorCodes.UniqueViolation
            && error.ConstraintName is "employees_employee_id_ci_uq" or "employees_email_ci_uq")
        {
            throw error.ConstraintName == "employees_employee_id_ci_uq"
                ? new GstockApplicationException(
                    ErrorCodes.Duplicate, "That employee number is already in use.", "employeeNumber")
                : new GstockApplicationException(
                    ErrorCodes.Duplicate, "That email address is already in use.", "email");
        }
    }

    public async Task<EmployeeSnapshot?> FindByIdAsync(
        Guid employeeId, CancellationToken cancellationToken)
    {
        var rows = await reads.QueryAsync<EmployeeSnapshot>(
            SelectEmployee + " WHERE id = $1",
            [new NpgsqlParameter { Value = employeeId }],
            ReadEmployee,
            cancellationToken);

        return rows.SingleOrDefault();
    }

    public Task<EmployeeSnapshot?> FindByEmailForUpdateAsync(
        string email, IUnitOfWork work, CancellationToken cancellationToken) =>
        FindForUpdateAsync(
            work, " WHERE lower(email) = lower($1)", email, cancellationToken);

    public Task<EmployeeSnapshot?> FindByIdForUpdateAsync(
        Guid employeeId, IUnitOfWork work, CancellationToken cancellationToken) =>
        FindForUpdateAsync(
            work, " WHERE id = $1", employeeId, cancellationToken);

    private static async Task<EmployeeSnapshot?> FindForUpdateAsync(
        IUnitOfWork work,
        string predicate,
        object value,
        CancellationToken cancellationToken)
    {
        await using var command = work.Connection.CreateCommand();
        command.Transaction = work.Transaction;
        command.CommandText = SelectEmployee + predicate + " FOR UPDATE";
        command.Parameters.Add(new NpgsqlParameter { Value = value });

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        return await reader.ReadAsync(cancellationToken)
            ? ReadEmployee(reader)
            : null;
    }

    private static EmployeeSnapshot ReadEmployee(DbDataReader reader)
    {
        var permission = reader.GetString(6) switch
        {
            "none" => EmployeeAccountPermission.None,
            "manage_employee_accounts" => EmployeeAccountPermission.ManageEmployeeAccounts,
            _ => throw new InvalidOperationException("Unknown employee account permission.")
        };

        var status = reader.GetString(7) switch
        {
            "active" => EmployeeAccountStatus.Active,
            "inactive" => EmployeeAccountStatus.Inactive,
            _ => throw new InvalidOperationException("Unknown employee account status.")
        };

        return new EmployeeSnapshot(
            reader.GetGuid(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetString(5),
            permission,
            status);
    }
}
