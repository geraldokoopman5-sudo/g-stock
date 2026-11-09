namespace Gstock.Contracts.Common;

public sealed record PageResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    long PageCount,
    long Total,
    long Start,
    long End
);
