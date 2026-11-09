using System.Data.Common;
using Gstock.Contracts.Common;

namespace Gstock.backend.Shared.Persistence;

public sealed class PostgresUnitOfWork : IUnitOfWork
{
    private PostgresUnitOfWork(DbConnection connection, DbTransaction transaction)
    {
        Connection = connection;
        Transaction = transaction;
    }

    public DbConnection Connection { get; }
    public DbTransaction Transaction { get; }

    public static async Task<PostgresUnitOfWork> BeginAsync(
        PostgresConnectionFactory connections,
        CancellationToken cancellationToken = default)
    {
        var connection = await connections.OpenAsync(cancellationToken);
        try
        {
            var transaction = await connection.BeginTransactionAsync(cancellationToken);
            return new PostgresUnitOfWork(connection, transaction);
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    public Task CommitAsync(CancellationToken cancellationToken = default) =>
        Transaction.CommitAsync(cancellationToken);

    public Task RollbackAsync(CancellationToken cancellationToken = default) =>
        Transaction.RollbackAsync(cancellationToken);

    public async ValueTask DisposeAsync()
    {
        try
        {
            await Transaction.DisposeAsync();
        }
        finally
        {
            await Connection.DisposeAsync();
        }
    }
}
