using Npgsql;

namespace Gstock.Api.Shared.Database;

internal static class SqlMigrationRunner
{
    private const string MigrationName = "001_initial.sql";
    private const string ResourceName = "Gstock.Migrations.001_initial.sql";

    public static async Task RunAsync(NpgsqlDataSource dataSource)
    {
        await using var connection = await dataSource.OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();

        // A second runner waits here until the first transaction ends.
        await using var takeLock = new NpgsqlCommand(
            "SELECT pg_advisory_xact_lock(57307711)", connection, transaction);
        await takeLock.ExecuteNonQueryAsync();

        await using var createHistory = new NpgsqlCommand("""
            CREATE TABLE IF NOT EXISTS public.schema_migrations (
                name text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """, connection, transaction);
        await createHistory.ExecuteNonQueryAsync();

        await using var checkHistory = new NpgsqlCommand("""
            SELECT EXISTS (
                SELECT 1 FROM public.schema_migrations WHERE name = @name
            )
            """, connection, transaction);
        checkHistory.Parameters.AddWithValue("name", MigrationName);

        if (await checkHistory.ExecuteScalarAsync() is true)
        {
            await transaction.CommitAsync();
            Console.WriteLine($"{MigrationName} is already applied to {connection.Database}.");
            return;
        }

        using var stream = typeof(SqlMigrationRunner).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Missing embedded migration: {ResourceName}");
        using var reader = new StreamReader(stream);
        var sql = await reader.ReadToEndAsync();

        await using var apply = new NpgsqlCommand(sql, connection, transaction);
        await apply.ExecuteNonQueryAsync();

        await using var record = new NpgsqlCommand("""
            INSERT INTO public.schema_migrations (name) VALUES (@name)
            """, connection, transaction);
        record.Parameters.AddWithValue("name", MigrationName);
        await record.ExecuteNonQueryAsync();

        await transaction.CommitAsync();
        Console.WriteLine($"Applied {MigrationName} to {connection.Database}.");
    }
}
