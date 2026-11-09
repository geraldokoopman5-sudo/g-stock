using System.Dynamic;

namespace Gstock.Contracts.Common;

public static class ErrorCodes
{
    public const string MalformedRequest = "malformed_request";
    public const string Unauthorized = "unauthorized";
    public const string Forbidden = "forbidden";
    public const string NotFound = "not_found";
    public const string Duplicate = "duplicate";
    public const string StaleQuantity = "stale_quantity";
    public const string ValidationFailed = "validation_failed";
    public const string NoChange = "no_change";
    public const string RateLimited = "rate_limited";
    public const string InternalError = "internal_error";
    public const string RequestFailed = "request_failed";
}