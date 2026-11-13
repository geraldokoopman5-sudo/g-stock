using Npgsql;

namespace Gstock.Api.Shared.Database;

internal static class DataBaseConnectionCheck
{
   public static async Task RunAsync(NpgsqlDataSource dataSource)
    {
        await using var connection = await dataSource.OpenConnectionAsync();

        await using var check = new NpgsqlCommand("SELECT 1", connection);
        var result = await check.ExecuteScalarAsync();

        if (result is not 1)
        {
            throw new InvalidOperationException("PostgreSQL did not return 1.");
        }

        await using var database = new NpgsqlCommand("SELECT current_database()", connection);
        var name = await database.ExecuteScalarAsync();

        Console.WriteLine($"PostgreSQL connection OK. Database: {name}");
    }  
}