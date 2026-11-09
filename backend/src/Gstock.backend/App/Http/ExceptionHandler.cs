using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;
using Gstock.backend.Shared.Persistence;
using Microsoft.AspNetCore.Diagnostics;

namespace Gstock.backend.App.Http;

public sealed class ExceptionHandler(ILogger<ExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        var error = exception as GstockApplicationException
            ?? DatabaseMapper.TryMap(exception);

        var status = exception is BadHttpRequestException badRequest
            ? badRequest.StatusCode
            : error?.Code switch
            {
                ErrorCodes.MalformedRequest => 400,
                ErrorCodes.Unauthorized => 401,
                ErrorCodes.Forbidden => 403,
                ErrorCodes.NotFound => 404,
                ErrorCodes.Duplicate or ErrorCodes.StaleQuantity => 409,
                ErrorCodes.ValidationFailed or ErrorCodes.NoChange => 422,
                ErrorCodes.RateLimited => 429,
                _ => 500
            };

        if (status >= 500)
        {
            logger.LogError("Request {TraceId} failed with {ExceptionType}",
                context.TraceIdentifier, exception.GetType().Name);
        }

        var details = error is not null && status < 500
            ? new ErrorDetails(error.Code, error.Message, error.Field)
            : DescribeStatus(status);

        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new ErrorResponse(details), cancellationToken);
        return true;
    }

    public static Task WriteEmptyResponseAsync(StatusCodeContext context)
    {
        var http = context.HttpContext;
        var details = DescribeStatus(http.Response.StatusCode);
        return http.Response.WriteAsJsonAsync(new ErrorResponse(details), http.RequestAborted);
    }

    private static ErrorDetails DescribeStatus(int status) => status switch
    {
        400 => new(ErrorCodes.MalformedRequest, "The request is invalid."),
        401 => new(ErrorCodes.Unauthorized, "Sign in to continue."),
        403 => new(ErrorCodes.Forbidden, "You do not have access to this operation."),
        404 => new(ErrorCodes.NotFound, "The requested resource was not found."),
        429 => new(ErrorCodes.RateLimited, "Too many requests. Try again later."),
        >= 500 => new(ErrorCodes.InternalError, "An unexpected error occurred."),
        _ => new(ErrorCodes.RequestFailed, "The request could not be completed.")
    };
}