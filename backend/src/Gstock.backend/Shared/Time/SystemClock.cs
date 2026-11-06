using Gstock.Contracts.Common;

namespace Gstock.backend.Shared.Time;

public sealed class SystemClock : IClock
{
    public DateTimeOffset UctNow => DateTime.UtcNow;
}