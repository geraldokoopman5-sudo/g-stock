using System.Security.Claims;
using System.Text;
using Npgsql;

namespace Gstock.Api.Shared.Api;

internal sealed class ApiError(int status, string message, string? field = null) : Exception(message)
{
    public int Status { get; } = status;
    public string? Field { get; } = field;

    public static ApiError Invalid(string field, string message) => new(422, message, field);
    public static ApiError Forbidden() => new(403, "This account cannot perform that action.");
    public static ApiError Missing(string subject) => new(404, $"{subject} was not found.");
    public static ApiError Conflict(string message) => new(409, message);
}

internal static class ApiRequests
{
    public static Guid EmployeeId(this ClaimsPrincipal principal) =>
        principal.TryEmployeeId(out var id) ? id : throw new ApiError(401, "Sign in to continue.");

    private static bool TryEmployeeId(this ClaimsPrincipal user, out Guid employeeId) =>
        Guid.TryParse(user.FindFirstValue("sub"), out employeeId) && employeeId != Guid.Empty;

    public static string RequiredText(string? value, string field, int maxLength) =>
        !string.IsNullOrWhiteSpace(value) ? Text(value, field, maxLength) : throw ApiError.Invalid(field, "This field is required.");

    public static string Text(string value, string field, int maxLength)
    {
        var trimmed = value.Trim();
        if (trimmed.Contains('\0') || trimmed.EnumerateRunes().Count() > maxLength)
        {
            throw ApiError.Invalid(field, $"Enter valid text of at most {maxLength} characters.");
        }

        return trimmed;
    }

    public static WebApplication UseGstockApiErrors(this WebApplication app)
    {
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            catch (ApiError error) when (!context.Response.HasStarted)
            {
                var result = error.Field is null
                    ? Results.Problem(statusCode: error.Status, detail: error.Message)
                    : Results.ValidationProblem(
                        new Dictionary<string, string[]> { [error.Field] = [error.Message] },
                        statusCode: error.Status);
                await result.ExecuteAsync(context);
            }
            catch (PostgresException error) when (
                !context.Response.HasStarted && error.SqlState == PostgresErrorCodes.UniqueViolation &&
                error.ConstraintName is "brands_warehouse_name_uq" or "inventory_items_sku_uq" or
                    "employees_email_uq" or "employees_employee_id_uq")
            {
                string message = error.ConstraintName switch
                {
                    "brands_warehouse_name_uq" => "This warehouse already has a brand with that name.",
                    "inventory_items_sku_uq" => "An item with this SKU already exists.",
                    "employees_email_uq" => "An employee with this email already exists.",
                    _ => "An employee with this employee number already exists."
                };
                await Results.Problem(statusCode: 409, detail: message).ExecuteAsync(context);
            }
        });
        return app;
    }
}
