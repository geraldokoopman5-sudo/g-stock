using Gstock.Api.Modules.Activity.Application;
using Gstock.Api.Modules.Brands.Domain;
using Gstock.Api.Modules.Brands.Infrastructure;
using Gstock.Api.Modules.Employees.Application;
using Gstock.Api.Shared.Api;
using Gstock.Api.Shared.Database;
using Gstock.Contracts;

namespace Gstock.Api.Modules.Brands.Application;

internal sealed record CreateBrandInput(Guid WarehouseId, string? Name, string? Description, byte[]? ProfilePhoto);

internal sealed class BrandService(
    PostgresBrandRepository brands, IEmployeeDirectory employees,
    IInventoryActivityRepository activity, PostgresUnitOfWork database)
{
    public Task<Brand> CreateAsync(CreateBrandInput input, Guid actorId, CancellationToken token)
    {
        var name = ApiRequests.RequiredText(input.Name, "name", 100);
        var description = ApiRequests.Text(input.Description ?? "", "description", 250);
        var photo = InventoryPhoto.Validate(input.ProfilePhoto);

        return database.RunAsync(async (transaction, ct) =>
        {
            var actor = await employees.RequireRoleAsync(actorId, AccountRoles.StockManager, transaction, ct);
            var brand = await brands.InsertAsync(input.WarehouseId, name, description, photo, transaction, ct);
            await activity.AddAsync(new InventoryEvent("brand-created", brand.WarehouseId, brand.Id,
                null, brand.Name, actor), transaction, ct);
            return brand;
        }, token);
    }

    public Task ArchiveAsync(Guid id, Guid actorId, CancellationToken token) =>
        database.RunAsync(async (transaction, ct) =>
        {
            var actor = await employees.RequireRoleAsync(actorId, AccountRoles.StockManager, transaction, ct);
            var brand = await brands.LockActiveAsync(id, transaction, ct) ?? throw ApiError.Missing("Brand");
            if (!await brands.TryArchiveAsync(id, transaction, ct))
            {
                throw ApiError.Conflict("Archive this brand's remaining items first.");
            }
            await activity.AddAsync(new InventoryEvent("brand-deleted", brand.WarehouseId, id,
                null, brand.Name, actor), transaction, ct);
            return true;
        }, token);

    public Task<Brand> SetPhotoAsync(Guid id, SetInventoryPhotoInput input, Guid actorId, CancellationToken token)
    {
        var photo = InventoryPhoto.Validate(input.ProfilePhoto);
        return database.RunAsync(async (transaction, ct) =>
        {
            await employees.RequireRoleAsync(actorId, AccountRoles.StockManager, transaction, ct);
            if (await brands.LockActiveAsync(id, transaction, ct) is null) throw ApiError.Missing("Brand");
            return await brands.SetPhotoAsync(id, photo, transaction, ct);
        }, token);
    }
}
