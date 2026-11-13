using Gstock.Api.Modules.Warehouses.Domain;

namespace Gstock.Api.Modules.Warehouses.Application;

internal interface IWarehouseRepository
{
    Task<IReadOnlyList<Warehouse>> ListAsync(CancellationToken cancellationToken);
}
