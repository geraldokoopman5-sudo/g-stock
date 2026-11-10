using Gstock.Contracts.Common;
using Gstock.backend.Modules.Authentication.Application;
using Gstock.backend.Modules.Authentication.Domain;
using Npgsql;

namespace Gstock.backend.Modules.Authentication.Infrastructure;

internal sealed class PostgresCredentialRepository : ICredentialRepository
{
    public async Task<EmployeeCredential?> FindByEmployeeIdAsync(
        Guid employeeId, IUnitOfWork work, CancellationToken cancellationToken)
    {
        await using var command = work.Connection.CreateCommand();
        command.Transaction = work.Transaction;
        command.CommandText = """
            SELECT password_hash, password_changed_at
            FROM public.employee_credentials
            WHERE employee_id = $1
            """;
        command.Parameters.Add(new NpgsqlParameter { Value = employeeId });

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new EmployeeCredential(employeeId, reader.GetString(0), reader.GetFieldValue<DateTimeOffset>(1))
            : null;
    }

    public async Task InsertAsync(
        EmployeeCredential credential, IUnitOfWork work, CancellationToken cancellationToken)
    {
        await using var command = work.Connection.CreateCommand();
        command.Transaction = work.Transaction;
        command.CommandText = """
            INSERT INTO public.employee_credentials (employee_id, password_hash, password_changed_at)
            VALUES ($1, $2, $3)
            """;
        command.Parameters.Add(new NpgsqlParameter { Value = credential.EmployeeId });
        command.Parameters.Add(new NpgsqlParameter { Value = credential.PasswordHash });
        command.Parameters.Add(new NpgsqlParameter { Value = credential.PasswordChangedAt });

        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
