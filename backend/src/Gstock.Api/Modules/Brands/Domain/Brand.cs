namespace Gstock.Api.Modules.Brands.Domain;

internal sealed record Brand(
    Guid Id, Guid WarehouseId, string Name, string Description, DateTime DateAdded, bool HasProfilePhoto);
