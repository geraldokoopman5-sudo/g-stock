using System.Net.Mail;
using System.Text.Json.Serialization;
using Gstock.Api.Modules.Authentication.Infrastructure;
using Gstock.Api.Modules.Employees.Infrastructure;
using Gstock.Api.Shared.Api;
using Gstock.Api.Shared.Database;
using Gstock.Contracts;

namespace Gstock.Api.Modules.Employees.Application;

internal sealed record EmployeeProfile(
    Guid Id, string EmployeeId, string FullName, string Email,
    [property: JsonConverter(typeof(JsonStringEnumConverter<AccountRoles>))] AccountRoles AccountRole,
    [property: JsonConverter(typeof(JsonStringEnumConverter<AccountRoles>))] AccountRoles Role,
    [property: JsonConverter(typeof(JsonStringEnumConverter<AccountStatus>))] AccountStatus Status,
    DateTime CreatedAt, DateTime UpdatedAt);

internal sealed record CreateEmployeeInput(
    string? EmployeeId, string? FullName, string? Email,
    [property: JsonConverter(typeof(JsonStringEnumConverter<AccountRoles>))] AccountRoles? AccountRole,
    string? Password,
    [property: JsonConverter(typeof(JsonStringEnumConverter<AccountRoles>))] AccountRoles? Role = null);

internal sealed record EditEmployeeInput(
    string? EmployeeId, string? FullName, string? Email,
    [property: JsonConverter(typeof(JsonStringEnumConverter<AccountRoles>))] AccountRoles? Role,
    [property: JsonConverter(typeof(JsonStringEnumConverter<AccountStatus>))] AccountStatus? Status,
    string? Password);

internal sealed record ChangeAccountTypeInput(
    [property: JsonConverter(typeof(JsonStringEnumConverter<AccountRoles>))] AccountRoles? AccountRole);

internal sealed record EmployeeFieldChange(string Field, string Before, string After);
internal sealed record EmployeeEditor(Guid Id, string EmployeeId, string FullName, string Role);

// An edit with no profile changes represents a password change. Password material is never included.
internal sealed record EmployeeEditEntry(Guid Id, DateTime EditedAt, EmployeeEditor EditedBy, List<EmployeeFieldChange> Changes)
{
    public string Kind => Changes.Count == 0 ? "password-changed" : "profile-edited";
}

internal sealed class EmployeeService(
    PostgresEmployeeRepository repository, IEmployeeDirectory employees, PostgresUnitOfWork database)
{
    public Task<EmployeeProfile> ChangeAccountTypeAsync(
        Guid id, ChangeAccountTypeInput input, Guid actorId, CancellationToken token) =>
        database.RunAsync(async (transaction, ct) =>
        {
            var actor = await employees.RequireRoleAsync(actorId, AccountRoles.StaffManager, transaction, ct);
            if (input.AccountRole is not { } accountRole || !Enum.IsDefined(accountRole))
            {
                throw ApiError.Invalid("accountRole", "Select a valid account type.");
            }
            var before = await repository.LockAsync(id, transaction, ct, normalEmployeeOnly: false)
                ?? throw ApiError.Missing("Employee");
            if (before.AccountRole == accountRole)
            {
                throw ApiError.Invalid("accountRole", "Select a different account type.");
            }
            var updated = await repository.ChangeAccountTypeAsync(id, accountRole, transaction, ct);
            await repository.RecordEditAsync(id, actor,
                [new EmployeeFieldChange("account_role", EmployeeRoleMapping.Write(before.AccountRole), EmployeeRoleMapping.Write(accountRole)),
                 new EmployeeFieldChange("role", EmployeeRoleMapping.Write(before.Role), EmployeeRoleMapping.Write(updated.Role))],
                transaction, ct);
            await repository.RevokeSessionsAsync(id, "admin", transaction, ct);
            return updated;
        }, token);

    public Task<EmployeeProfile> CreateAsync(CreateEmployeeInput input, Guid actorId, CancellationToken token)
    {
        var employeeId = ApiRequests.RequiredText(input.EmployeeId, "employeeId", 32);
        var name = ApiRequests.RequiredText(input.FullName, "fullName", 100);
        var email = Email(input.Email);
        var password = Password(input.Password);
        if (input.AccountRole is not { } accountRole || !Enum.IsDefined(accountRole))
        {
            throw ApiError.Invalid("accountRole", "Select a valid account role.");
        }
        if (input.Role is { } title && title != accountRole)
        {
            throw ApiError.Invalid("role", "Job title must match the account type.");
        }

        return database.RunAsync(async (transaction, ct) =>
        {
            await employees.RequireRoleAsync(actorId, AccountRoles.StaffManager, transaction, ct);
            return await repository.InsertAsync(employeeId, name, email, accountRole,
                Argon2idPasswordVerifier.Hash(password), transaction, ct);
        }, token);
    }

    public Task<EmployeeProfile> EditAsync(Guid id, EditEmployeeInput input, Guid actorId, CancellationToken token)
    {
        if (input.Status is { } status && !Enum.IsDefined(status))
        {
            throw ApiError.Invalid("status", "Select a valid account status.");
        }
        var password = input.Password is null ? null : Password(input.Password);

        return database.RunAsync(async (transaction, ct) =>
        {
            var actor = await employees.RequireRoleAsync(actorId, AccountRoles.StaffManager, transaction, ct);
            var before = await repository.LockAsync(id, transaction, ct);
            if (before is null)
            {
                throw await repository.ExistsAsync(id, transaction, ct)
                    ? ApiError.Forbidden() : ApiError.Missing("Employee");
            }
            if (input.Role is { } title && title != before.Role)
            {
                throw ApiError.Invalid("role", "Job title is read-only. Change the account type to update it.");
            }
            var after = before with
            {
                EmployeeId = input.EmployeeId is null ? before.EmployeeId : ApiRequests.RequiredText(input.EmployeeId, "employeeId", 32),
                FullName = input.FullName is null ? before.FullName : ApiRequests.RequiredText(input.FullName, "fullName", 100),
                Email = input.Email is null ? before.Email : Email(input.Email),
                Status = input.Status ?? before.Status
            };
            var changes = ProfileChanges(before, after);
            if (changes.Count == 0 && password is null)
            {
                throw ApiError.Invalid("employee", "There are no changes to save.");
            }

            var updated = await repository.UpdateAsync(after, transaction, ct);
            if (changes.Count > 0)
            {
                await repository.RecordEditAsync(id, actor, changes, transaction, ct);
            }
            if (password is not null)
            {
                await repository.ReplaceCredentialAsync(id, Argon2idPasswordVerifier.Hash(password), transaction, ct);
                await repository.RecordEditAsync(id, actor, [], transaction, ct);
            }
            if (password is not null || (before.Status == AccountStatus.Active && updated.Status == AccountStatus.InActive))
            {
                await repository.RevokeSessionsAsync(id, password is null ? "admin" : "password-change", transaction, ct);
            }
            return updated;
        }, token);
    }

    private static List<EmployeeFieldChange> ProfileChanges(EmployeeProfile before, EmployeeProfile after)
    {
        var changes = new List<EmployeeFieldChange>();
        Add("employee_id", before.EmployeeId, after.EmployeeId);
        Add("full_name", before.FullName, after.FullName);
        Add("email", before.Email, after.Email);
        Add("is_active", before.Status == AccountStatus.Active ? "true" : "false",
            after.Status == AccountStatus.Active ? "true" : "false");
        return changes;

        void Add(string field, string oldValue, string newValue)
        {
            if (!string.Equals(oldValue, newValue, StringComparison.Ordinal))
            {
                changes.Add(new EmployeeFieldChange(field, oldValue, newValue));
            }
        }
    }

    private static string Email(string? input)
    {
        var email = ApiRequests.RequiredText(input, "email", 254);
        return MailAddress.TryCreate(email, out var parsed) && email == parsed.Address
            ? email : throw ApiError.Invalid("email", "Enter a valid email address.");
    }

    private static string Password(string? value) =>
        value is { Length: >= 8 and <= 128 } && !value.Contains('\0')
            ? value : throw ApiError.Invalid("password", "Enter a password between 8 and 128 characters.");
}
