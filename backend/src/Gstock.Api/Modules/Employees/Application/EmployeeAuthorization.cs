using System.Data.Common;
using Gstock.Api.Shared.Api;
using Gstock.Contracts;

namespace Gstock.Api.Modules.Employees.Application;

internal static class EmployeeAuthorization
{
    public static async Task<EmployeeActor> RequireRoleAsync(
        this IEmployeeDirectory employees, Guid actorId, AccountRoles role,
        DbTransaction transaction, CancellationToken cancellationToken)
    {
        var actor = await employees.FindForWriteAsync(actorId, transaction, cancellationToken);
        return actor is { Status: AccountStatus.Active } && actor.Role == role
            ? actor
            : throw ApiError.Forbidden();
    }
}
