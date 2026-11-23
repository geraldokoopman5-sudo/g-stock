using System.Data.Common;
using Gstock.Api.Modules.Warehouses.Domain;

namespace Gstock.Api.Modules.Warehouses.Application;

internal interface IWarehouseRepository
{
    Task<IReadOnlyList<Warehouse>> ListAsync(CancellationToken cancellationToken);

    Task<Warehouse?> FindAsync(Guid id, CancellationToken cancellationToken);

    Task<string?> LockActiveAsync(Guid id, DbTransaction transaction, CancellationToken token);
    Task<IReadOnlyList<Guid>> LockActiveBrandsAsync(Guid id, DbTransaction transaction, CancellationToken token);
    Task ArchiveAsync(Guid id, DbTransaction transaction, CancellationToken token);

    Task AddAsync(
        Warehouse warehouse,
        DbTransaction transaction,
        CancellationToken cancellationToken);
}
