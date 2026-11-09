using System.Security.Cryptography;
using System.Text;
using Gstock.backend.Shared.Persistence;
using Npgsql;

namespace Gstock.backend.App.Administration;

public static class MigrateDatabaseCommand
{
    private const string ResourcePrefix = "Gstock.Migrations.";

    public static async Task<int> RunAsync(
        string connectionString,
        CancellationToken cancellationToken = default)
    {
        var assembly = typeof(MigrateDatabaseCommand).Assembly;
        var names = assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(ResourcePrefix, StringComparison.Ordinal)
                && name.EndsWith(".sql", StringComparison.Ordinal))
            .Select(name => name[ResourcePrefix.Length..])
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        if (names.Length == 0)
        {
            throw new InvalidOperationException("No SQL migrations are embedded.");
        }

        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var connections = new PostgresConnectionFactory(dataSource);
        await using var work = await PostgresUnitOfWork.BeginAsync(connections, cancellationToken);
        await using var command = work.Connection.CreateCommand();
        command.Transaction = work.Transaction;

        command.CommandText = """
            SELECT pg_catalog.pg_advisory_xact_lock(
                pg_catalog.hashtext('gstock_schema_migrations'), 1);
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);

        command.CommandText = """
            SET LOCAL search_path TO public;

            CREATE TABLE IF NOT EXISTS public.gstock_schema_migrations (
                script_name text PRIMARY KEY,
                sha256 text NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT now()
            );
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);

        var applied = new SortedDictionary<string, string>(StringComparer.Ordinal);
        command.CommandText = "SELECT script_name, sha256 FROM public.gstock_schema_migrations";
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                applied.Add(reader.GetString(0), reader.GetString(1));
            }
        }

        if (!applied.Keys.SequenceEqual(names.Take(applied.Count), StringComparer.Ordinal))
        {
            throw new InvalidOperationException("The embedded scripts do not match the migration history.");
        }

        var count = 0;
        foreach (var name in names)
        {
            using var reader = new StreamReader(
                assembly.GetManifestResourceStream(ResourcePrefix + name)
                    ?? throw new InvalidOperationException($"Missing migration {name}."),
                Encoding.UTF8);

            var sql = (await reader.ReadToEndAsync(cancellationToken)).ReplaceLineEndings("\n");
            if (string.IsNullOrWhiteSpace(sql))
            {
                throw new InvalidOperationException($"Migration {name} is empty.");
            }

            var checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sql)));
            if (applied.TryGetValue(name, out var previousChecksum))
            {
                if (checksum != previousChecksum)
                {
                    throw new InvalidOperationException($"Applied migration {name} was changed.");
                }

                continue;
            }

            Console.WriteLine($"Applying {name}");
            command.CommandText = sql;
            await command.ExecuteNonQueryAsync(cancellationToken);

            command.CommandText = """
                INSERT INTO public.gstock_schema_migrations (script_name, sha256)
                VALUES ($1, $2)
                """;
            command.Parameters.Add(new NpgsqlParameter { Value = name });
            command.Parameters.Add(new NpgsqlParameter { Value = checksum });
            await command.ExecuteNonQueryAsync(cancellationToken);
            command.Parameters.Clear();
            count++;
        }

        await work.CommitAsync(cancellationToken);
        return count;
    }
}