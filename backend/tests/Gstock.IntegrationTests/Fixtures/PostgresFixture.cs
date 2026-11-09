using Gstock.backend.Shared.Persistence;
using Npgsql;

namespace Gstock.IntegrationTests.Fixtures;

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly NpgsqlDataSource _dataSource;

    public PostgresFixture()
    {
        var connectionString = Environment.GetEnvironmentVariable("GSTOCK_TEST_POSTGRES");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("Set GSTOCK_TEST_POSTGRES for database tests.");
        }

        _dataSource = NpgsqlDataSource.Create(connectionString);
        Connections = new PostgresConnectionFactory(_dataSource);
    }

    public PostgresConnectionFactory Connections { get; }

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync() => _dataSource.DisposeAsync().AsTask();
}
