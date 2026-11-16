using System.Data.Common;
using Gstock.Contracts;

namespace Gstock.Api.Modules.Activity.Application;

internal sealed record WarehouseCreatedActivity(
    Guid Id, Guid WarehouseId, string WarehouseName, Guid ActorId, string ActorEmployeeId, string ActorFullName);

internal sealed record InventoryEvent(
    string Type, Guid WarehouseId, Guid BrandId, Guid? ItemId, string Name, EmployeeActor Actor,
    int? PreviousQuantity = null, int? Quantity = null, string? Unit = null);

internal sealed record ActivityActor(Guid Id, string EmployeeId, string FullName);
internal sealed record ActivityEntry(
    Guid Id, string Type, Guid WarehouseId, Guid? BrandId, Guid? ItemId, string EntityName,
    ActivityActor Actor, DateTime OccurredAt, int? PreviousQuantity, int? Quantity, string? Unit);

internal sealed record ActivityFilter(
    Guid? WarehouseId, Guid? BrandId, Guid? ItemId, string? Type,
    DateTimeOffset? From, DateTimeOffset? To, int Limit, int Offset);

internal interface IInventoryActivityRepository
{
    Task AddWarehouseCreatedAsync(WarehouseCreatedActivity activity, DbTransaction transaction, CancellationToken token);
    Task AddAsync(InventoryEvent activity, DbTransaction transaction, CancellationToken token);
    Task<IReadOnlyList<ActivityEntry>> ListAsync(ActivityFilter filter, CancellationToken token);
}
