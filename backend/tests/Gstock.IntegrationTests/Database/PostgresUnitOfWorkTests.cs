using Gstock.backend.Shared.Persistence;
using Gstock.IntegrationTests.Fixtures;
using Npgsql;

namespace Gstock.IntegrationTests.Database;

public sealed class PostgresUnitOfWorkTests(PostgresFixture postgres)
    : IClassFixture<PostgresFixture>
{
    [Fact]
    public async Task ParameterizedReadReturnsTheSuppliedValue()
    {
        var reads = new SqlReadExecutor(postgres.Connections);
        var rows = await reads.QueryAsync(
            "SELECT $1::integer",
            [new NpgsqlParameter { Value = 42 }],
            row => row.GetInt32(0));

        Assert.Equal(42, Assert.Single(rows));
    }

    [Fact]
    public async Task RollbackRemovesTheTemporaryWrite()
    {
        await using var work = await PostgresUnitOfWork.BeginAsync(postgres.Connections);
        await using var command = work.Connection.CreateCommand();
        command.Transaction = work.Transaction;
        command.CommandText = "CREATE TEMP TABLE gstock_stage2_probe AS SELECT 1 AS id";
        await command.ExecuteNonQueryAsync();

        await work.RollbackAsync();
        command.Transaction = null;
        command.CommandText = "SELECT to_regclass('pg_temp.gstock_stage2_probe') IS NULL";

        Assert.True(await command.ExecuteScalarAsync() is true);
    }
}
