using Npgsql;

namespace Gstock.backend.Shared.Persistence;

public sealed class PostgresConnectionFactory(NpgsqlDataSource dataSource)
{
    public ValueTask<NpgsqlConnection> OpenAsync(
        CancellationToken cancellationToken = default) =>
        dataSource.OpenConnectionAsync(cancellationToken);
}
