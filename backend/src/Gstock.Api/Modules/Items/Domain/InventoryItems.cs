namespace Gstock.Api.Modules.Items;

public class InventoryItems
{
    public required Guid Id{get; init;}
    public required Guid BrandId{get; init;}
    public required Guid WarehouseId{get; init;}
    public required string ItemName{get; init;}
    public required string SKU{get; init;}
    public required int quantity{get;set;}
    public required string Unit{get; set;}
    public required DateTime CreatedAt{get; init;}
    public required DateTime ArchivedAt{get; set;}
}