using Gstock.Api.Modules.Authentication.Application;
using Npgsql;

namespace Gstock.Api.Modules.Authentication.Infrastructure;

internal sealed class PostgresAuthSessionRepository(NpgsqlDataSource dataSource)
    : IAuthSessionRepository
{
    public async Task<AuthenticatedSession?> FindActiveAsync(
        Guid sessionId,
        Guid employeeId,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT session.id, session.employee_id
            FROM public.auth_sessions AS session
            JOIN public.employees AS employee ON employee.id = session.employee_id
            WHERE session.id = @session_id
              AND session.employee_id = @employee_id
              AND employee.is_active
              AND session.revoked_at IS NULL
              AND session.idle_expires_at > statement_timestamp()
              AND session.absolute_expires_at > statement_timestamp();
            """;

        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue("session_id", sessionId);
        command.Parameters.AddWithValue("employee_id", employeeId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new AuthenticatedSession(reader.GetGuid(0), reader.GetGuid(1));
    }
}
