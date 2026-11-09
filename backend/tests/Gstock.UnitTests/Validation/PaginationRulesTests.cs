using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;
using Gstock.backend.Shared.Validation;

namespace Gstock.UnitTests.Validation;

public sealed class PaginationRulesTests
{
    [Theory]
    [InlineData(10)]
    [InlineData(20)]
    [InlineData(50)]
    [InlineData(100)]
    public void AllowedPageSizesCalculateOffsets(int pageSize)
    {
        Assert.Equal(0L, PaginationRules.GetOffset(new PageRequest(1, pageSize)));
        Assert.Equal(2L * pageSize, PaginationRules.GetOffset(new PageRequest(3, pageSize)));
    }

    [Theory]
    [InlineData(0, 20, "page")]
    [InlineData(-1, 20, "page")]
    [InlineData(1, 0, "pageSize")]
    [InlineData(1, 13, "pageSize")]
    [InlineData(1, 101, "pageSize")]
    public void InvalidRequestsIdentifyTheInvalidField(int page, int pageSize, string field)
    {
        var error = Assert.Throws<GstockApplicationException>(() =>
            PaginationRules.GetOffset(new PageRequest(page, pageSize)));

        Assert.Equal(ErrorCodes.ValidationFailed, error.Code);
        Assert.Equal(field, error.Field);
    }

    [Fact]
    public void LargePageNumbersDoNotOverflowTheOffset()
    {
        Assert.Equal(214748364600L,
            PaginationRules.GetOffset(new PageRequest(int.MaxValue, 100)));
    }

    [Fact]
    public void FinalPartialPageHasOneBasedPositionsAndRoundedPageCount()
    {
        var result = PaginationRules.CreateResult(new PageRequest(3, 10), new[] { "last" }, 21);

        Assert.Equal(3L, result.PageCount);
        Assert.Equal(21L, result.Start);
        Assert.Equal(21L, result.End);
        Assert.Equal(21L, result.Total);
        Assert.Equal(3, result.Page);
        Assert.Equal(10, result.PageSize);
        Assert.Equal("last", Assert.Single(result.Items));
    }

    [Theory]
    [InlineData(0L, 0L)]
    [InlineData(20L, 2L)]
    [InlineData(long.MaxValue, 922337203685477581L)]
    public void EmptyPagesHaveZeroPositionsAndPreserveTotalPageCount(long total, long pageCount)
    {
        var result = PaginationRules.CreateResult(new PageRequest(5, 10), Array.Empty<int>(), total);

        Assert.Equal(0L, result.Start);
        Assert.Equal(0L, result.End);
        Assert.Equal(pageCount, result.PageCount);
    }

    [Fact]
    public void NegativeTotalsAreRejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            PaginationRules.CreateResult(new PageRequest(), Array.Empty<int>(), -1));
    }
}
