namespace Gstock.Api.Modules.Items.Domain;

internal sealed record InventoryItems(
    Guid Id, Guid BrandId, Guid WarehouseId, string Name, string? Sku,
    int Quantity, string Unit, DateTime AddedAt, string Location, int ReorderLevel,
    bool HasProfilePhoto, DateTime? PhotoUpdatedAt);
