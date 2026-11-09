using System.Data.Common;

namespace Gstock.Contracts.Common;

public interface IUnitOfWork : IAsyncDisposable
{
    DbConnection Connection {get;}
    DbTransaction Transaction{get;}

    Task CommitAsync(CancellationToken cancellationToken = default);
    Task RollbackAsync(CancellationToken cancellationToken = default);
}