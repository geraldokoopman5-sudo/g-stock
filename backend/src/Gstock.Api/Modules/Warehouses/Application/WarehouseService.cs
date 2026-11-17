using Gstock.Api.Modules.Activity.Application;
using Gstock.Api.Modules.Warehouses.Domain;
using Gstock.Api.Shared.Api;
using Gstock.Api.Shared.Database;
using Gstock.Contracts;

namespace Gstock.Api.Modules.Warehouses.Application;

internal sealed record CreateWarehouseInput(
    string? Name,
    string? StreetName,
    string? SuburbName,
    string? City,
    string? Province,
    int? PostalCode);

internal sealed class WarehouseService(
    IWarehouseRepository warehouses,
    IInventoryActivityRepository activities,
    IEmployeeDirectory employees,
    PostgresUnitOfWork database)
{
    public Task<Warehouse> CreateAsync(
        CreateWarehouseInput input,
        Guid actorId,
        CancellationToken cancellationToken)
    {
        var warehouse = new Warehouse
        {
            Id = Guid.NewGuid(),
            Name = ApiRequests.RequiredText(input.Name, "name", 100),
            StreetName = ApiRequests.RequiredText(input.StreetName, "streetName"),
            SuburbName = ApiRequests.RequiredText(input.SuburbName, "suburbName"),
            City = ApiRequests.RequiredText(input.City, "city"),
            Province = ApiRequests.RequiredText(input.Province, "province"),
            PostalCode = input.PostalCode
                ?? throw ApiError.Invalid("postalCode", "Postal code is required.")
        };

        return database.RunAsync(async (transaction, token) =>
        {
            var actor = await employees.FindForWriteAsync(actorId, transaction, token);
            if (actor is not { Status: AccountStatus.Active })
            {
                throw ApiError.Forbidden();
            }

            await warehouses.AddAsync(warehouse, transaction, token);

            var activity = new WarehouseCreatedActivity(
                Guid.NewGuid(), warehouse.Id, warehouse.Name,
                actor.Id, actor.EmployeeNumber, actor.FullName);
            await activities.AddWarehouseCreatedAsync(activity, transaction, token);

            return warehouse;
        }, cancellationToken);
    }
}
