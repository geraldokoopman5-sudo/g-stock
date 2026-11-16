using System.Data.Common;
using Npgsql;
using NpgsqlTypes;

namespace Gstock.Api.Shared.Database;

internal static class PostgresCommand
{
    public static NpgsqlCommand InTransaction(DbTransaction transaction, string sql)
    {
        if (transaction is not NpgsqlTransaction { Connection: { } connection } postgres)
        {
            throw new InvalidOperationException("An active PostgreSQL transaction is required.");
        }

        return new NpgsqlCommand(sql, connection, postgres);
    }

    public static NpgsqlCommand Bind(this NpgsqlCommand command, string name, object value)
    {
        command.Parameters.AddWithValue(name, value);
        return command;
    }

    public static NpgsqlCommand BindNullable(
        this NpgsqlCommand command, string name, NpgsqlDbType type, object? value)
    {
        command.Parameters.AddWithValue(name, type, value ?? DBNull.Value);
        return command;
    }

    public static T? NullableValue<T>(this NpgsqlDataReader reader, int ordinal) where T : struct =>
        reader.IsDBNull(ordinal) ? null : reader.GetFieldValue<T>(ordinal);

    public static string? NullableText(this NpgsqlDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
}
