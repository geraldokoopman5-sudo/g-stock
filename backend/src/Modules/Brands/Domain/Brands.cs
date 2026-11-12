namespace Gstock.Api.Modules.Brands.Domain;

public class Brands
{
    public required Guid Id{get; init;}
    public required Guid WarehouseId{get; init;}
    public required string BrandName{get; init;}
    public required string Description{get; init;}
    public required DateTime DateAdded{get; init;}
    public required byte[]? BrandPhoto{get; init;}
    public required DateTime ArchivedAt {get; init;}
}