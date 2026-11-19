using System.Security.Claims;
using Gstock.Api.Modules.Items.Application;
using Gstock.Api.Modules.Items.Infrastructure;
using Gstock.Api.Shared.Api;
using Microsoft.AspNetCore.Mvc;

namespace Gstock.Api.Modules.Items.Api;

internal static class ItemEndpoints
{
    public static void MapItemEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var routes = endpoints.MapGroup("/api/v1/items").RequireAuthorization();
        routes.MapGet("", async (Guid? warehouseId, Guid? brandId, string? query, int? limit, int? offset,
            [FromServices] PostgresItemRepository items, CancellationToken token) =>
            Results.Ok(await items.ReadAsync(null, warehouseId, brandId, query,
                Math.Clamp(limit ?? 50, 1, 200), Math.Max(offset ?? 0, 0), token)));
        routes.MapGet("/{id:guid}", async (Guid id, [FromServices] PostgresItemRepository items, CancellationToken token) =>
            Results.Ok((await items.ReadAsync(id, null, null, null, 1, 0, token)).SingleOrDefault()
                ?? throw ApiError.Missing("Item")));
        routes.MapPost("", async (CreateItemInput input, ClaimsPrincipal user,
            [FromServices] ItemService items, CancellationToken token) =>
        {
            var item = await items.CreateAsync(input, user.EmployeeId(), token);
            return Results.Created($"/api/v1/items/{item.Id}", item);
        });
        routes.MapGet("/{id:guid}/photo", async (Guid id, HttpContext context,
            [FromServices] PostgresItemRepository items, CancellationToken token) =>
            InventoryPhoto.File(await items.ReadPhotoAsync(id, token), context));
        routes.MapPut("/{id:guid}/photo", async (Guid id, SetInventoryPhotoInput input, ClaimsPrincipal user,
            [FromServices] ItemService items, CancellationToken token) =>
            Results.Ok(await items.SetPhotoAsync(id, input, user.EmployeeId(), token)));
        routes.MapPost("/{id:guid}/adjustments", async (Guid id, AdjustStockInput input, ClaimsPrincipal user,
            [FromServices] ItemService items, CancellationToken token) =>
            Results.Ok(await items.AdjustAsync(id, input, user.EmployeeId(), token)));
        routes.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user,
            [FromServices] ItemService items, CancellationToken token) =>
        {
            await items.ArchiveAsync(id, user.EmployeeId(), token);
            return Results.NoContent();
        });
    }
}
