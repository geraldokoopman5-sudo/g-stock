using System.Security.Claims;
using Gstock.Api.Modules.Employees.Application;
using Gstock.Api.Modules.Employees.Infrastructure;
using Gstock.Api.Shared.Api;
using Microsoft.AspNetCore.Mvc;

namespace Gstock.Api.Modules.Employees.Api;

internal static class EmployeeEndpoints
{
    public static void MapEmployeeEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var routes = endpoints.MapGroup("/api/v1/employees").RequireAuthorization();
        routes.MapGet("", async (string? query, int? limit, int? offset,
            [FromServices] PostgresEmployeeRepository employees, CancellationToken token) =>
            Results.Ok(await employees.ReadAsync(null, query, Math.Clamp(limit ?? 50, 1, 200),
                Math.Max(offset ?? 0, 0), token)));
        routes.MapGet("/{id:guid}", async (Guid id, [FromServices] PostgresEmployeeRepository employees,
            CancellationToken token) => Results.Ok(await FindAsync(employees, id, token)));
        routes.MapGet("/{id:guid}/edits", async (Guid id, int? limit, int? offset,
            [FromServices] PostgresEmployeeRepository employees, CancellationToken token) =>
        {
            await FindAsync(employees, id, token);
            return Results.Ok(await employees.ReadEditsAsync(id, Math.Clamp(limit ?? 50, 1, 200),
                Math.Max(offset ?? 0, 0), token));
        });
        routes.MapPost("", async (CreateEmployeeInput input, ClaimsPrincipal user,
            [FromServices] EmployeeService employees, CancellationToken token) =>
        {
            var employee = await employees.CreateAsync(input, user.EmployeeId(), token);
            return Results.Created($"/api/v1/employees/{employee.Id}", employee);
        });
        routes.MapPatch("/{id:guid}", async (Guid id, EditEmployeeInput input, ClaimsPrincipal user,
            [FromServices] EmployeeService employees, CancellationToken token) =>
            Results.Ok(await employees.EditAsync(id, input, user.EmployeeId(), token)));
    }

    internal static async Task<EmployeeProfile> FindAsync(
        PostgresEmployeeRepository employees, Guid id, CancellationToken token) =>
        (await employees.ReadAsync(id, null, 1, 0, token)).SingleOrDefault() ?? throw ApiError.Missing("Employee");
}
