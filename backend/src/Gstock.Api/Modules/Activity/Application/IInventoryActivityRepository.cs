using System.Data.Common;

namespace Gstock.Api.Modules.Activity.Application;

internal sealed record WarehouseCreatedActivity(
    Guid Id,
    Guid WarehouseId,
    string WarehouseName,
    Guid ActorId,
    string ActorEmployeeId,
    string ActorFullName);

internal interface IInventoryActivityRepository
{
    Task AddWarehouseCreatedAsync(
        WarehouseCreatedActivity activity,
        DbTransaction transaction,
        CancellationToken cancellationToken);
}
