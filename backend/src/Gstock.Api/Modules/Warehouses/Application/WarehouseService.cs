using System.Text;
using Gstock.Api.Modules.Activity.Application;
using Gstock.Api.Modules.Warehouses.Domain;
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
            Name = RequiredText(input.Name, nameof(input.Name)),
            StreetName = RequiredText(input.StreetName, nameof(input.StreetName)),
            SuburbName = RequiredText(input.SuburbName, nameof(input.SuburbName)),
            City = RequiredText(input.City, nameof(input.City)),
            Province = RequiredText(input.Province, nameof(input.Province)),
            PostalCode = input.PostalCode
                ?? throw new ArgumentException("Postal code is required.", nameof(input.PostalCode))
        };

        if (warehouse.Name.EnumerateRunes().Count() > 100)
        {
            throw new ArgumentException(
                "Warehouse name can have at most 100 characters.", nameof(input.Name));
        }

        return database.RunAsync(async (transaction, token) =>
        {
            var actor = await employees.FindForWriteAsync(actorId, transaction, token);
            if (actor is not { Status: AccountStatus.Active, Role: AccountRoles.StockManager })
            {
                throw new UnauthorizedAccessException(
                    "Only an active Stock Manager can create a warehouse.");
            }

            await warehouses.AddAsync(warehouse, transaction, token);

            var activity = new WarehouseCreatedActivity(
                Guid.NewGuid(), warehouse.Id, warehouse.Name,
                actor.Id, actor.EmployeeNumber, actor.FullName);
            await activities.AddWarehouseCreatedAsync(activity, transaction, token);

            return warehouse;
        }, cancellationToken);
    }

    private static string RequiredText(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("This field is required.", field);
        }

        return value.Trim();
    }
}
