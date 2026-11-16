using Gstock.Api.Modules.Authentication.Application;
using Gstock.Api.Shared.Database;
using Npgsql;

namespace Gstock.Api.Modules.Authentication.Infrastructure;

internal sealed class PostgresLoginRepository(NpgsqlDataSource dataSource) : ILoginRepository
{
    public async Task<LoginCredential?> FindActiveCredentialAsync(string email, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT employee.id, credential.password_hash
            FROM public.employees AS employee
            JOIN public.employee_credentials AS credential ON credential.employee_id = employee.id
            WHERE lower(employee.email) = lower(@email) AND employee.is_active;
            """;
        await using var command = dataSource.CreateCommand(sql).Bind("email", email);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new LoginCredential(reader.GetGuid(0), reader.GetString(1))
            : null;
    }

    public async Task<bool> TryCreateSessionAsync(LoginCredential credential, string email, Guid sessionId,
        DateTimeOffset issuedAt, bool rememberMe, SessionWindow window, RefreshGrant refresh, CancellationToken cancellationToken)
    {
        const string sql = """
            WITH active_employee AS MATERIALIZED (
                SELECT id FROM public.employees
                WHERE id = @employee_id AND lower(email) = lower(@email) AND is_active FOR SHARE
            ), current_credential AS (
                SELECT employee.id FROM active_employee AS employee
                JOIN public.employee_credentials AS credential ON credential.employee_id = employee.id
                WHERE credential.password_hash = @password_hash FOR SHARE OF credential
            ), new_session AS (
                INSERT INTO public.auth_sessions (id, employee_id, remember_me, created_at, last_refreshed_at,
                                                   absolute_expires_at, idle_expires_at)
                SELECT @session_id, id, @remember, @issued_at, @issued_at, @absolute, @idle
                FROM current_credential RETURNING id, absolute_expires_at
            )
            INSERT INTO public.refresh_tokens (id, session_id, token_hash, created_at, expires_at)
            SELECT @refresh_id, id, @refresh_hash, @issued_at, absolute_expires_at FROM new_session;
            """;
        await using var command = dataSource.CreateCommand(sql).Bind("email", email).Bind("employee_id", credential.EmployeeId)
            .Bind("password_hash", credential.PasswordHash).Bind("session_id", sessionId).Bind("issued_at", issuedAt)
            .Bind("remember", rememberMe).Bind("absolute", window.AbsoluteExpiry).Bind("idle", window.IdleExpiry)
            .Bind("refresh_id", refresh.Id).Bind("refresh_hash", refresh.Hash);
        return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
    }
}
