using Npgsql;

namespace Gstock.backend.Shared.Persistence;

public sealed class SqlReadExecutor(PostgresConnectionFactory connections)
{
    public async Task<IReadOnlyList<T>> QueryAsync<T>(
        string sql,
        IReadOnlyList<NpgsqlParameter> parameters,
        Func<NpgsqlDataReader, T> mapRow,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);

        foreach (var parameter in parameters)
        {
            command.Parameters.Add(parameter);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<T>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(mapRow(reader));
        }

        return rows;
    }
}
