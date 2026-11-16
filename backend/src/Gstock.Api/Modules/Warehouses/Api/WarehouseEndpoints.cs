using System.Security.Claims;
using System.Text.Json;
using Gstock.Api.Modules.Warehouses.Application;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

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
    }

    private static async Task<IResult> CreateAsync(
        CreateWarehouseInput input,
        ClaimsPrincipal user,
        [FromServices] WarehouseService warehouses,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(user.FindFirstValue("sub"), out var employeeId) || employeeId == Guid.Empty)
        {
            return Results.Unauthorized();
        }

        try
        {
            var warehouse = await warehouses.CreateAsync(input, employeeId, cancellationToken);
            return Results.Created($"/api/v1/warehouses/{warehouse.Id}", warehouse);
        }
        catch (ArgumentException exception) when (exception.ParamName is not null)
        {
            var field = JsonNamingPolicy.CamelCase.ConvertName(exception.ParamName);
            return Results.ValidationProblem(
                new Dictionary<string, string[]> { [field] = [exception.Message] },
                statusCode: StatusCodes.Status422UnprocessableEntity);
        }
        catch (UnauthorizedAccessException exception)
        {
            return Results.Problem(statusCode: StatusCodes.Status403Forbidden, detail: exception.Message);
        }
        catch (PostgresException exception) when (
            exception.SqlState == PostgresErrorCodes.UniqueViolation &&
            exception.ConstraintName is "warehouses_name_uq" or "warehouses_address_uq")
        {
            var detail = exception.ConstraintName == "warehouses_name_uq"
                ? "A warehouse with this name already exists."
                : "A warehouse with this address already exists.";

            return Results.Problem(statusCode: StatusCodes.Status409Conflict, detail: detail);
        }
    }
}
