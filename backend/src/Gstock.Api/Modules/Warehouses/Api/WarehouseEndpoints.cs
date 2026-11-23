using System.Security.Claims;
using Gstock.Api.Modules.Warehouses.Application;
using Gstock.Api.Shared.Api;
using Microsoft.AspNetCore.Mvc;

namespace Gstock.Api.Modules.Warehouses.Api;

internal static class WarehouseEndpoints
{
    public static void MapWarehouseEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var warehouses = endpoints.MapGroup("/api/v1/warehouses").RequireAuthorization();
        warehouses.MapGet("", async (IWarehouseRepository repository, CancellationToken token) =>
            Results.Ok(await repository.ListAsync(token)));
        warehouses.MapGet("/{id:guid}", async Task<IResult> (
            Guid id, IWarehouseRepository repository, CancellationToken token) =>
            await repository.FindAsync(id, token) is { } warehouse ? Results.Ok(warehouse) : Results.NotFound());
        warehouses.MapPost("", CreateAsync);
        warehouses.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user,
            [FromServices] WarehouseService service, CancellationToken token) =>
        {
            await service.ArchiveAsync(id, user.EmployeeId(), token);
            return Results.NoContent();
        });
    }

    private static async Task<IResult> CreateAsync(
        CreateWarehouseInput input,
        ClaimsPrincipal user,
        [FromServices] WarehouseService warehouses,
        CancellationToken cancellationToken)
    {
        var warehouse = await warehouses.CreateAsync(input, user.EmployeeId(), cancellationToken);
        return Results.Created($"/api/v1/warehouses/{warehouse.Id}", warehouse);
    }
}
