using System.Security.Claims;
using Gstock.Api.Modules.Brands.Application;
using Gstock.Api.Modules.Brands.Infrastructure;
using Gstock.Api.Shared.Api;
using Microsoft.AspNetCore.Mvc;

namespace Gstock.Api.Modules.Brands.Api;

internal static class BrandEndpoints
{
    public static void MapBrandEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var routes = endpoints.MapGroup("/api/v1/brands").RequireAuthorization();
        routes.MapGet("", async (Guid? warehouseId, string? query, int? limit, int? offset,
            [FromServices] PostgresBrandRepository brands, CancellationToken token) =>
            Results.Ok(await brands.ReadAsync(null, warehouseId, query, Math.Clamp(limit ?? 50, 1, 200),
                Math.Max(offset ?? 0, 0), token)));
        routes.MapGet("/{id:guid}", async (Guid id, [FromServices] PostgresBrandRepository brands, CancellationToken token) =>
            Results.Ok((await brands.ReadAsync(id, null, null, 1, 0, token)).SingleOrDefault()
                ?? throw ApiError.Missing("Brand")));
        routes.MapGet("/{id:guid}/photo", async (
            Guid id, HttpContext context, [FromServices] PostgresBrandRepository brands, CancellationToken token) =>
        {
            return InventoryPhoto.File(await brands.ReadPhotoAsync(id, token), context);
        });
        routes.MapPut("/{id:guid}/photo", async (Guid id, SetInventoryPhotoInput input, ClaimsPrincipal user,
            [FromServices] BrandService brands, CancellationToken token) =>
            Results.Ok(await brands.SetPhotoAsync(id, input, user.EmployeeId(), token)));
        routes.MapPost("", async (CreateBrandInput input, ClaimsPrincipal user,
            [FromServices] BrandService brands, CancellationToken token) =>
        {
            var brand = await brands.CreateAsync(input, user.EmployeeId(), token);
            return Results.Created($"/api/v1/brands/{brand.Id}", brand);
        });
        routes.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user,
            [FromServices] BrandService brands, CancellationToken token) =>
        {
            await brands.ArchiveAsync(id, user.EmployeeId(), token);
            return Results.NoContent();
        });
    }
}
