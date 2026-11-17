using Npgsql;

namespace Gstock.Api.Shared.Database;

internal static class SqlMigrationRunner
{
    private const string ResourcePrefix = "Gstock.Migrations.";

    public static async Task RunAsync(NpgsqlDataSource dataSource)
    {
        var assembly = typeof(SqlMigrationRunner).Assembly;
        var resources = assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(ResourcePrefix, StringComparison.Ordinal) &&
                           name.EndsWith(".sql", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (resources.Length == 0)
        {
            throw new InvalidOperationException("No SQL migrations were embedded.");
        }

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

        var applied = new HashSet<string>(StringComparer.Ordinal);
        await using (var history = new NpgsqlCommand("SELECT name FROM public.schema_migrations", connection, transaction))
        await using (var rows = await history.ExecuteReaderAsync())
        {
            while (await rows.ReadAsync())
            {
                applied.Add(rows.GetString(0));
            }
        }

        var pending = resources.Where(name => !applied.Contains(name[ResourcePrefix.Length..])).ToArray();
        foreach (var resource in pending)
        {
            using var stream = assembly.GetManifestResourceStream(resource)
                ?? throw new InvalidOperationException($"Missing embedded migration: {resource}");
            using var reader = new StreamReader(stream);
            var sql = await reader.ReadToEndAsync();

            await using var apply = new NpgsqlCommand(sql, connection, transaction);
            await apply.ExecuteNonQueryAsync();

            await using var record = new NpgsqlCommand("""
                INSERT INTO public.schema_migrations (name) VALUES (@name)
                """, connection, transaction);
            record.Parameters.AddWithValue("name", resource[ResourcePrefix.Length..]);
            await record.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();

        if (pending.Length == 0)
        {
            Console.WriteLine($"All migrations are already applied to {connection.Database}.");
        }
        foreach (var resource in pending)
        {
            Console.WriteLine($"Applied {resource[ResourcePrefix.Length..]} to {connection.Database}.");
        }
    }
}
