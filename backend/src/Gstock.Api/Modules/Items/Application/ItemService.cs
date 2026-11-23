using System.Data.Common;
using System.Text.RegularExpressions;
using Gstock.Api.Modules.Activity.Application;
using Gstock.Api.Modules.Brands.Infrastructure;
using Gstock.Api.Modules.Employees.Application;
using Gstock.Api.Modules.Items.Domain;
using Gstock.Api.Modules.Items.Infrastructure;
using Gstock.Api.Shared.Api;
using Gstock.Api.Shared.Database;
using Gstock.Contracts;

namespace Gstock.Api.Modules.Items.Application;

internal sealed record CreateItemInput(Guid BrandId, string? Name, string? Sku, int? Quantity, string? Unit,
    Guid? WarehouseId, string? Location = null, int? ReorderLevel = null, byte[]? ProfilePhoto = null);
internal sealed record AdjustStockInput(string? Mode, int? Quantity, int? ExpectedQuantity, string? Reason);

internal sealed class ItemService(
    PostgresItemRepository items, PostgresBrandRepository brands, IEmployeeDirectory employees,
    IInventoryActivityRepository activity, PostgresUnitOfWork database)
{
    private const int MaxQuantity = 1_000_000_000;

    public Task<InventoryItems> CreateAsync(CreateItemInput input, Guid actorId, CancellationToken token)
    {
        var name = ApiRequests.RequiredText(input.Name, "name", 100);
        var sku = string.IsNullOrWhiteSpace(input.Sku) ? null :
            ApiRequests.Text(Regex.Replace(input.Sku.Trim(), @"\s+", " "), "sku", 40);
        var quantity = Quantity(input.Quantity, "quantity");
        var location = ApiRequests.Text(input.Location ?? "", "location", 80);
        var reorderLevel = Quantity(input.ReorderLevel ?? 0, "reorderLevel");
        var photo = InventoryPhoto.Validate(input.ProfilePhoto);
        var unit = input.Unit?.Trim().ToLowerInvariant();
        if (unit is not ("units" or "boxes" or "rolls" or "cases" or "pairs"))
        {
            throw ApiError.Invalid("unit", "Use units, boxes, rolls, cases, or pairs.");
        }

        return database.RunAsync(async (transaction, ct) =>
        {
            var actor = await employees.RequireRoleAsync(actorId, AccountRoles.Nemployee, transaction, ct);
            var brand = await brands.LockActiveAsync(input.BrandId, transaction, ct) ?? throw ApiError.Missing("Brand");
            if (input.WarehouseId is { } requestedWarehouse && requestedWarehouse != brand.WarehouseId)
            {
                throw ApiError.Invalid("warehouseId", "The item must belong to its brand's warehouse.");
            }
            var item = await items.InsertAsync(input.BrandId, brand.WarehouseId, name, sku, quantity, unit,
                location, reorderLevel, photo, transaction, ct);
            await activity.AddAsync(Event("item-created", item, actor), transaction, ct);
            return item;
        }, token);
    }

    public Task<InventoryItems> AdjustAsync(Guid id, AdjustStockInput input, Guid actorId, CancellationToken token)
    {
        var amount = Quantity(input.Quantity, "quantity");
        var expected = Quantity(input.ExpectedQuantity, "expectedQuantity");
        var reason = ApiRequests.RequiredText(input.Reason, "reason", 500);
        var mode = input.Mode?.Trim().ToLowerInvariant();
        if (mode is not ("add" or "remove" or "set"))
        {
            throw ApiError.Invalid("mode", "Use add, remove, or set.");
        }

        return database.RunAsync(async (transaction, ct) =>
        {
            var actor = await employees.RequireRoleAsync(actorId, AccountRoles.Nemployee, transaction, ct);
            var item = await LockItemAsync(id, transaction, ct);
            if (item.Quantity != expected)
            {
                throw ApiError.Conflict("Stock changed since you loaded the item. Reload it and try again.");
            }

            var updated = mode switch
            {
                "add" => item.Quantity + amount,
                "remove" => item.Quantity - amount,
                _ => amount
            };
            if (updated < 0 || updated > MaxQuantity || updated == item.Quantity)
            {
                throw ApiError.Invalid("quantity", "The adjustment must change stock within the allowed range.");
            }

            await items.SetQuantityAsync(id, updated, transaction, ct);
            var adjusted = item with { Quantity = updated };
            await activity.AddAsync(Event("quantity-updated", adjusted, actor, item.Quantity, reason), transaction, ct);
            return adjusted;
        }, token);
    }

    public Task<InventoryItems> SetPhotoAsync(Guid id, SetInventoryPhotoInput input, Guid actorId, CancellationToken token)
    {
        var photo = InventoryPhoto.Validate(input.ProfilePhoto);
        return database.RunAsync(async (transaction, ct) =>
        {
            await employees.RequireRoleAsync(actorId, AccountRoles.Nemployee, transaction, ct);
            await LockItemAsync(id, transaction, ct);
            return await items.SetPhotoAsync(id, photo, transaction, ct);
        }, token);
    }

    public Task ArchiveAsync(Guid id, Guid actorId, CancellationToken token) =>
        database.RunAsync(async (transaction, ct) =>
        {
            var actor = await employees.RequireRoleAsync(actorId, AccountRoles.Nemployee, transaction, ct);
            var item = await LockItemAsync(id, transaction, ct);
            if (item.Quantity != 0)
            {
                throw ApiError.Conflict("Only items with zero stock can be deleted.");
            }
            await items.ArchiveAsync(id, transaction, ct);
            await activity.AddAsync(Event("item-deleted", item, actor), transaction, ct);
            return true;
        }, token);

    private async Task<InventoryItems> LockItemAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        var brandId = await items.FindBrandAsync(id, transaction, token) ?? throw ApiError.Missing("Item");
        if (await brands.LockActiveAsync(brandId, transaction, token) is null)
        {
            throw ApiError.Missing("Item");
        }
        return await items.LockActiveAsync(id, transaction, token) ?? throw ApiError.Missing("Item");
    }

    private static int Quantity(int? value, string field) =>
        value is >= 0 and <= MaxQuantity ? value.Value : throw ApiError.Invalid(field, "Enter a quantity from 0 to 1,000,000,000.");

    private static InventoryEvent Event(
        string type, InventoryItems item, EmployeeActor actor, int? previous = null, string? reason = null) =>
        new(type, item.WarehouseId, item.BrandId, item.Id, item.Name, actor, previous, item.Quantity, item.Unit, reason);
}
