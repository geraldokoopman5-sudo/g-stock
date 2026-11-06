namespace Gstock.Contracts.Common;

public interface IClock
{
    public DateTimeOffset  UctNow{get; }
}