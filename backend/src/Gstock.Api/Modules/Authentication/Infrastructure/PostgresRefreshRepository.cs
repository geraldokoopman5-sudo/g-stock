using System.Data.Common;
using Gstock.Api.Modules.Authentication.Application;
using Gstock.Api.Shared.Database;
using Npgsql;

namespace Gstock.Api.Modules.Authentication.Infrastructure;

internal sealed record LockedRefresh(
    Guid Id, Guid SessionId, Guid EmployeeId, bool RememberMe, DateTimeOffset AbsoluteExpiry,
    bool Revoked, bool Consumed, bool Expired, DateTimeOffset EffectiveNow);

internal sealed class PostgresRefreshRepository(NpgsqlDataSource source, PostgresUnitOfWork database)
{
    public async Task<bool> CanBootstrapAsync(string hash, CancellationToken token)
    {
        const string sql = """
            SELECT EXISTS (
                SELECT 1 FROM public.refresh_tokens t
                JOIN public.auth_sessions s ON s.id = t.session_id
                JOIN public.employees e ON e.id = s.employee_id
                WHERE t.token_hash = @hash AND t.consumed_at IS NULL AND s.revoked_at IS NULL AND e.is_active
                  AND t.expires_at > statement_timestamp() AND s.idle_expires_at > statement_timestamp()
                  AND s.absolute_expires_at > statement_timestamp()
            );
            """;
        await using var command = source.CreateCommand(sql).Bind("hash", hash);
        return await command.ExecuteScalarAsync(token) is true;
    }

    public async Task<LockedRefresh?> LockAsync(string hash, DbTransaction transaction, CancellationToken token)
    {
        // Hold the employee lock before taking session and token locks, matching account edits.
        const string employeeSql = """
            SELECT e.id FROM public.refresh_tokens t
            JOIN public.auth_sessions s ON s.id = t.session_id
            JOIN public.employees e ON e.id = s.employee_id
            WHERE t.token_hash = @hash AND e.is_active FOR SHARE OF e;
            """;
        await using var employee = PostgresCommand.InTransaction(transaction, employeeSql).Bind("hash", hash);
        if (await employee.ExecuteScalarAsync(token) is not Guid employeeId)
        {
            return null;
        }

        const string tokenSql = """
            SELECT t.id, s.id, s.remember_me, s.absolute_expires_at,
                   s.revoked_at IS NOT NULL, t.consumed_at IS NOT NULL,
                   t.expires_at <= now_at OR s.idle_expires_at <= now_at OR s.absolute_expires_at <= now_at,
                   GREATEST(now_at, s.last_refreshed_at)
            FROM (
                SELECT id, session_id, consumed_at, expires_at
                FROM public.refresh_tokens WHERE token_hash = @hash FOR UPDATE
            ) t
            JOIN public.auth_sessions s ON s.id = t.session_id
            CROSS JOIN (SELECT clock_timestamp() AS now_at) clock
            WHERE s.employee_id = @employee FOR UPDATE OF s;
            """;
        // Serialize operations on the session before reading token state within the transaction.
        const string sessionSql = """
            SELECT s.id FROM public.auth_sessions s
            JOIN public.refresh_tokens t ON t.session_id = s.id
            WHERE t.token_hash = @hash AND s.employee_id = @employee FOR UPDATE OF s;
            """;
        await using var session = PostgresCommand.InTransaction(transaction, sessionSql)
            .Bind("hash", hash).Bind("employee", employeeId);
        if (await session.ExecuteScalarAsync(token) is not Guid)
        {
            return null;
        }

        await using var command = PostgresCommand.InTransaction(transaction, tokenSql)
            .Bind("hash", hash).Bind("employee", employeeId);
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token)
            ? new LockedRefresh(reader.GetGuid(0), reader.GetGuid(1), employeeId, reader.GetBoolean(2),
                reader.GetFieldValue<DateTimeOffset>(3), reader.GetBoolean(4), reader.GetBoolean(5),
                reader.GetBoolean(6), reader.GetFieldValue<DateTimeOffset>(7))
            : null;
    }

    public async Task RotateAsync(LockedRefresh current, RefreshGrant replacement, DateTimeOffset idleExpiry,
        DbTransaction transaction, CancellationToken token)
    {
        const string sql = """
            UPDATE public.refresh_tokens SET consumed_at = @now, replaced_by_token_id = @replacement WHERE id = @current;
            INSERT INTO public.refresh_tokens (id, session_id, token_hash, created_at, expires_at)
            VALUES (@replacement, @session, @hash, @now, @absolute);
            UPDATE public.auth_sessions SET last_refreshed_at = @now, idle_expires_at = @idle WHERE id = @session;
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql)
            .Bind("now", current.EffectiveNow).Bind("replacement", replacement.Id).Bind("current", current.Id)
            .Bind("session", current.SessionId).Bind("hash", replacement.Hash)
            .Bind("absolute", current.AbsoluteExpiry).Bind("idle", idleExpiry);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task RevokeReplayAsync(Guid sessionId, DbTransaction transaction, CancellationToken token)
    {
        const string sql = """
            UPDATE public.auth_sessions SET revoked_at = clock_timestamp(), revocation_reason = 'token-reuse'
            WHERE id = @id AND revoked_at IS NULL;
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", sessionId);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task LogoutByTokenAsync(string hash, CancellationToken token)
    {
        const string sql = """
            UPDATE public.auth_sessions s SET revoked_at = clock_timestamp(), revocation_reason = 'logout'
            FROM public.refresh_tokens t
            WHERE t.token_hash = @hash AND t.session_id = s.id AND s.revoked_at IS NULL;
            """;
        await using var command = source.CreateCommand(sql).Bind("hash", hash);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task LogoutAsync(Guid employeeId, Guid sessionId, CancellationToken token)
    {
        const string sql = """
            UPDATE public.auth_sessions SET revoked_at = clock_timestamp(), revocation_reason = 'logout'
            WHERE id = @session AND employee_id = @employee AND revoked_at IS NULL;
            """;
        await using var command = source.CreateCommand(sql).Bind("session", sessionId).Bind("employee", employeeId);
        await command.ExecuteNonQueryAsync(token);
    }

    public Task LogoutAllAsync(Guid employeeId, CancellationToken token) =>
        database.RunAsync(async (transaction, ct) =>
        {
            const string lockSql = "SELECT id FROM public.employees WHERE id = @employee FOR NO KEY UPDATE;";
            await using var employee = PostgresCommand.InTransaction(transaction, lockSql).Bind("employee", employeeId);
            if (await employee.ExecuteScalarAsync(ct) is not Guid)
            {
                return false;
            }

            const string sql = """
                UPDATE public.auth_sessions SET revoked_at = clock_timestamp(), revocation_reason = 'logout-all'
                WHERE employee_id = @employee AND revoked_at IS NULL;
                """;
            await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("employee", employeeId);
            await command.ExecuteNonQueryAsync(ct);
            return true;
        }, token);
}
