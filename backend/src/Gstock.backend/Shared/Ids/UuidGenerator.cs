using Gstock.Contracts.Common;

namespace Gstock.backend.Shared.Ids;

public sealed class UuidGenerator : IIdGenerator
{
    public Guid newId() => Guid.NewGuid();
}