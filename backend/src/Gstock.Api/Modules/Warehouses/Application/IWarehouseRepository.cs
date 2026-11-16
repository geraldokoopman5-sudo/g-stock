using System.Data.Common;
using Gstock.Api.Modules.Warehouses.Domain;

namespace Gstock.Api.Modules.Warehouses.Application;

internal interface IWarehouseRepository
{
    Task<IReadOnlyList<Warehouse>> ListAsync(CancellationToken cancellationToken);

    Task<Warehouse?> FindAsync(Guid id, CancellationToken cancellationToken);

    Task AddAsync(
        Warehouse warehouse,
        DbTransaction transaction,
        CancellationToken cancellationToken);
}
