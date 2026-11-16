using System.Data.Common;
using Gstock.Contracts;
using Npgsql;

namespace Gstock.Api.Modules.Employees.Infrastructure;

internal sealed class PostgresEmployeeDirectory : IEmployeeDirectory
{
    public async Task<EmployeeActor?> FindForWriteAsync(
        Guid actorId,
        DbTransaction transaction,
        CancellationToken cancellationToken)
    {
        if (transaction is not NpgsqlTransaction { Connection: { } connection } postgresTransaction)
        {
            throw new InvalidOperationException("An active PostgreSQL transaction is required.");
        }

        const string sql = """
            SELECT id, employee_id, full_name, is_active, account_role::text
            FROM public.employees
            WHERE id = @id
            FOR SHARE;
            """;

        await using var command = new NpgsqlCommand(sql, connection, postgresTransaction);
        command.Parameters.AddWithValue("id", actorId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var status = reader.GetBoolean(3) ? AccountStatus.Active : AccountStatus.InActive;
        var role = EmployeeRoleMapping.Read(reader.GetString(4));

        return new EmployeeActor(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), status, role);
    }
}
