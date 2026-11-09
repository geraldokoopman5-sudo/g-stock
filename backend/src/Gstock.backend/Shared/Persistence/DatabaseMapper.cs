using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;
using Npgsql;

namespace Gstock.backend.Shared.Persistence;

public static class DatabaseMapper
{
    public static GstockApplicationException?TryMap(Exception exception)
    {
        if(exception is PostgresException {SqlState: PostgresErrorCodes.UniqueViolation })
        {
            return new GstockApplicationException(ErrorCodes.Duplicate, "A record with those details already exist");
        }
        return null;
    }
}