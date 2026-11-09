using Npgsql;

namespace Gstock.backend.App.Administration;

public static class AdminCommandRunner
{
    public static bool Handles(string[] args) =>
        args.Length > 0 && args[0] == "--migrate";

    public static async Task<int> RunAsync(string[] args, IConfiguration configuration)
    {
        if (args.Length != 1)
        {
            Console.Error.WriteLine("Use --migrate by itself.");
            return 2;
        }

        var connectionString = configuration["Database:MigrationConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            Console.Error.WriteLine("Set Database__MigrationConnectionString.");
            return 2;
        }

        try
        {
            var count = await MigrateDatabaseCommand.RunAsync(connectionString);
            Console.WriteLine($"Applied migrations: {count}");
            return 0;
        }
        catch (PostgresException error)
        {
            Console.Error.WriteLine($"PostgreSQL migration failed (SQLSTATE {error.SqlState}).");
            return 1;
        }
        catch (NpgsqlException)
        {
            Console.Error.WriteLine("Check the PostgreSQL server and migration connection settings.");
            return 1;
        }
        catch (InvalidOperationException error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Migration failed ({error.GetType().Name}).");
            return 1;
        }
    }
}
