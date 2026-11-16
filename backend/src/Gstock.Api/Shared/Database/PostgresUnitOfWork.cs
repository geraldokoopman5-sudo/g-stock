using System.Data.Common;
using Npgsql;

namespace Gstock.Api.Shared.Database;

internal sealed class PostgresUnitOfWork(NpgsqlDataSource dataSource)
{
    public async Task<T> RunAsync<T>(
        Func<DbTransaction, CancellationToken, Task<T>> work,
        CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        var result = await work(transaction, cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return result;
    }
}
