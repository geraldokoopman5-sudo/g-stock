using System.Data.Common;
using Gstock.Api.Modules.Employees.Application;
using Gstock.Api.Shared.Database;
using Gstock.Contracts;
using Npgsql;
using NpgsqlTypes;

namespace Gstock.Api.Modules.Employees.Infrastructure;

internal sealed class PostgresEmployeeRepository(NpgsqlDataSource source)
{
    private const string Columns = "id, employee_id, full_name, email, account_role::text, role, is_active, created_at, updated_at, department";

    public async Task<IReadOnlyList<EmployeeProfile>> ReadAsync(Guid? id, string? query, int limit, int offset, CancellationToken token)
    {
        const string sql = $"""
            SELECT {Columns} FROM public.employees
            WHERE (@id IS NULL OR id = @id)
              AND (@query IS NULL OR strpos(lower(employee_id), lower(@query)) > 0
                   OR strpos(lower(full_name), lower(@query)) > 0
                   OR strpos(lower(email), lower(@query)) > 0
                   OR strpos(lower(role), lower(@query)) > 0)
            ORDER BY full_name, id LIMIT @limit OFFSET @offset;
            """;
        await using var command = source.CreateCommand(sql)
            .BindNullable("id", NpgsqlDbType.Uuid, id).BindNullable("query", NpgsqlDbType.Text, query)
            .Bind("limit", limit).Bind("offset", offset);
        await using var reader = await command.ExecuteReaderAsync(token);
        var employees = new List<EmployeeProfile>();
        while (await reader.ReadAsync(token))
        {
            employees.Add(ReadProfile(reader));
        }
        return employees;
    }

    public async Task<EmployeeProfile?> LockAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        const string sql = $"SELECT {Columns} FROM public.employees WHERE id = @id AND account_role = 'Nemployee' FOR NO KEY UPDATE;";
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? ReadProfile(reader) : null;
    }

    public async Task<bool> ExistsAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        const string sql = "SELECT EXISTS (SELECT 1 FROM public.employees WHERE id = @id);";
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        return await command.ExecuteScalarAsync(token) is true;
    }

    public async Task<EmployeeProfile> InsertAsync(
        string employeeId, string fullName, string email, string role, AccountRoles accountRole, string hash, string department,
        DbTransaction transaction, CancellationToken token)
    {
        const string sql = $"""
            WITH new_employee AS (
                INSERT INTO public.employees (id, employee_id, full_name, email, account_role, role, department)
                VALUES (@id, @number, @name, @email, CAST(@account_role AS public.account_role), @role, @department)
                RETURNING *
            ), new_credential AS (
                INSERT INTO public.employee_credentials (employee_id, password_hash)
                SELECT id, @hash FROM new_employee
            )
            SELECT {Columns} FROM new_employee;
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", Guid.NewGuid())
            .Bind("number", employeeId).Bind("name", fullName).Bind("email", email).Bind("role", role)
            .Bind("account_role", EmployeeRoleMapping.Write(accountRole)).Bind("hash", hash).Bind("department", department);
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token))
        {
            throw new InvalidOperationException("PostgreSQL did not return the inserted employee.");
        }
        return ReadProfile(reader);
    }

    public async Task<EmployeeProfile> UpdateAsync(EmployeeProfile changed, DbTransaction transaction, CancellationToken token)
    {
        const string sql = $"""
            UPDATE public.employees SET employee_id = @number, full_name = @name, email = @email,
                role = @role, department = @department, is_active = @active, updated_at = clock_timestamp() WHERE id = @id
            RETURNING {Columns};
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", changed.Id)
            .Bind("number", changed.EmployeeId).Bind("name", changed.FullName).Bind("email", changed.Email)
            .Bind("role", changed.Role).Bind("active", changed.Status == AccountStatus.Active).Bind("department", changed.Department);
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token))
        {
            throw new InvalidOperationException("PostgreSQL did not return the updated employee.");
        }
        return ReadProfile(reader);
    }

    public async Task ReplaceCredentialAsync(Guid id, string hash, DbTransaction transaction, CancellationToken token)
    {
        const string sql = """
            INSERT INTO public.employee_credentials (employee_id, password_hash) VALUES (@id, @hash)
            ON CONFLICT (employee_id) DO UPDATE SET password_hash = excluded.password_hash;
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id).Bind("hash", hash);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task RevokeSessionsAsync(Guid id, string reason, DbTransaction transaction, CancellationToken token)
    {
        const string sql = """
            UPDATE public.auth_sessions SET revoked_at = clock_timestamp(), revocation_reason = @reason
            WHERE employee_id = @id AND revoked_at IS NULL;
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id).Bind("reason", reason);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task RecordEditAsync(Guid id, EmployeeActor actor, IReadOnlyList<EmployeeFieldChange> changes,
        DbTransaction transaction, CancellationToken token)
    {
        const string editSql = """
            INSERT INTO public.employee_edits (id, target_employee_id, edited_by_id, editor_employee_id,
                editor_full_name, editor_role)
            SELECT @edit, @target, id, @number, @name, role FROM public.employees WHERE id = @editor;
            """;
        var editId = Guid.NewGuid();
        await using var edit = PostgresCommand.InTransaction(transaction, editSql)
            .Bind("edit", editId).Bind("target", id).Bind("editor", actor.Id)
            .Bind("number", actor.EmployeeNumber).Bind("name", actor.FullName);
        await edit.ExecuteNonQueryAsync(token);

        const string changeSql = """
            INSERT INTO public.employee_edit_changes (edit_id, field, before_value, after_value)
            VALUES (@edit, @field, @before, @after);
            """;
        foreach (var change in changes)
        {
            await using var command = PostgresCommand.InTransaction(transaction, changeSql).Bind("edit", editId)
                .Bind("field", change.Field).Bind("before", change.Before).Bind("after", change.After);
            await command.ExecuteNonQueryAsync(token);
        }
    }

    public async Task<IReadOnlyList<EmployeeEditEntry>> ReadEditsAsync(Guid id, int limit, int offset, CancellationToken token)
    {
        const string sql = """
            WITH page AS (
                SELECT id, edited_at, edited_by_id, editor_employee_id, editor_full_name, editor_role
                FROM public.employee_edits WHERE target_employee_id = @id
                ORDER BY edited_at DESC, id DESC LIMIT @limit OFFSET @offset
            )
            SELECT page.*, change.field, change.before_value, change.after_value
            FROM page LEFT JOIN public.employee_edit_changes AS change ON change.edit_id = page.id
            ORDER BY page.edited_at DESC, page.id DESC, change.field;
            """;
        await using var command = source.CreateCommand(sql).Bind("id", id).Bind("limit", limit).Bind("offset", offset);
        await using var reader = await command.ExecuteReaderAsync(token);
        var edits = new List<EmployeeEditEntry>();
        while (await reader.ReadAsync(token))
        {
            var editId = reader.GetGuid(0);
            if (edits.Count == 0 || edits[^1].Id != editId)
            {
                var editor = new EmployeeEditor(reader.GetGuid(2), reader.GetString(3), reader.GetString(4), reader.GetString(5));
                edits.Add(new EmployeeEditEntry(editId, reader.GetDateTime(1), editor, []));
            }
            if (!reader.IsDBNull(6))
            {
                edits[^1].Changes.Add(new EmployeeFieldChange(reader.GetString(6), reader.GetString(7), reader.GetString(8)));
            }
        }
        return edits;
    }

    private static EmployeeProfile ReadProfile(NpgsqlDataReader reader) => new(
        reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
        EmployeeRoleMapping.Read(reader.GetString(4)), reader.GetString(5),
        reader.GetBoolean(6) ? AccountStatus.Active : AccountStatus.InActive,
        reader.GetDateTime(7), reader.GetDateTime(8), reader.GetString(9));
}
