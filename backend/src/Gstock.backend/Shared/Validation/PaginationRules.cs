using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;

namespace Gstock.backend.Shared.Validation;

public static class PaginationRules
{
    public static long GetOffset(PageRequest request)
    {
        if (request.Page < 1)
        {
            throw new GstockApplicationException(
                ErrorCodes.ValidationFailed, "Page must be at least 1.", "page");
        }

        if (request.PageSize is not (10 or 20 or 50 or 100))
        {
            throw new GstockApplicationException(
                ErrorCodes.ValidationFailed, "Choose 10, 20, 50, or 100.", "pageSize");
        }

        return ((long)request.Page - 1) * request.PageSize;
    }

    public static PageResult<T> CreateResult<T>(
        PageRequest request, IReadOnlyList<T> items, long total)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(total);
        var offset = GetOffset(request);
        var pageCount = total / request.PageSize
            + (total % request.PageSize == 0 ? 0 : 1);
        var start = items.Count == 0 ? 0 : offset + 1;
        var end = items.Count == 0 ? 0 : offset + items.Count;

        return new PageResult<T>(
            items, request.Page, request.PageSize, pageCount, total, start, end);
    }
}
