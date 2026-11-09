namespace Gstock.Contracts.Common;
public sealed record PageRequest(
    int Page = 1,
    int PAgeSize = 20
);