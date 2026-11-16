using Gstock.Api.Modules.Activity.Application;
using Gstock.Api.Shared.Api;

namespace Gstock.Api.Modules.Activity.Api;

internal static class ActivityEndpoints
{
    public static void MapActivityEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/api/v1/inventory/activity", ListAsync).RequireAuthorization();
    }

    private static async Task<IResult> ListAsync(
        Guid? warehouseId, Guid? brandId, Guid? itemId, string? type,
        DateTimeOffset? from, DateTimeOffset? to, int? limit, int? offset,
        IInventoryActivityRepository activity, CancellationToken token)
    {
        if (from > to)
        {
            throw ApiError.Invalid("from", "The start date must be on or before the end date.");
        }

        var filter = new ActivityFilter(warehouseId, brandId, itemId, type, from, to,
            Math.Clamp(limit ?? 50, 1, 200), Math.Max(offset ?? 0, 0));
        return Results.Ok(await activity.ListAsync(filter, token));
    }
}
