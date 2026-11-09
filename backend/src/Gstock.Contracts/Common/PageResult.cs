namespace Gstock.Contracts.Common;

public sealed record PageResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PAgeSize,
    long PageCount,
    long Total,
    long Start,
    long End
);
