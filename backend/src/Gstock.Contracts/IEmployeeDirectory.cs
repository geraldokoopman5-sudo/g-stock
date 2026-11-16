using System.Data.Common;

namespace Gstock.Contracts;

public sealed record EmployeeActor(
    Guid Id,
    string EmployeeNumber,
    string FullName,
    AccountStatus Status,
    AccountRoles Role);

public interface IEmployeeDirectory
{
    Task<EmployeeActor?> FindForWriteAsync(
        Guid actorId,
        DbTransaction transaction,
        CancellationToken cancellationToken);
}
