using Gstock.backend.App.Composition;
using Gstock.backend.App.Composition.ModuleRegistration;
using Gstock.backend.Shared.Errors;
using Npgsql;

namespace Gstock.backend.App.Administration;

public static class AdminCommandRunner
{
    private const string ProvisionCommand = "--provision-employee";
    private const string ManageEmployeeAccounts = "--manage-employee-accounts";

    public static bool Handles(string[] args) =>
        args.Length > 0 && args[0] is "--migrate" or ProvisionCommand;

    public static Task<int> RunAsync(string[] args, WebApplicationBuilder builder) =>
        args[0] == ProvisionCommand
            ? RunProvisionAsync(args, builder)
            : RunMigrationAsync(args, builder.Configuration);

    private static async Task<int> RunProvisionAsync(string[] args, WebApplicationBuilder builder)
    {
        var manageEmployeeAccounts = args.Length == 2 && args[1] == ManageEmployeeAccounts;
        if (args.Length != 1 && !manageEmployeeAccounts)
        {
            Console.Error.WriteLine($"Use {ProvisionCommand} with the optional {ManageEmployeeAccounts} flag.");
            return 2;
        }

        var connectionString = builder.Configuration["Database:ProvisioningConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            Console.Error.WriteLine("Set Database__ProvisioningConnectionString.");
            return 2;
        }

        if (Console.IsInputRedirected)
        {
            Console.Error.WriteLine("Run employee provisioning from an interactive terminal.");
            return 2;
        }

        try
        {
            builder.Configuration["Database:ConnectionString"] = connectionString;
            builder.Services.AddApplicationServices(builder.Configuration);
            builder.Services.AddModules();

            await using var app = builder.Build();
            await using var scope = app.Services.CreateAsyncScope();
            var command = ActivatorUtilities.CreateInstance<ProvisionEmployeeCommand>(scope.ServiceProvider);
            return await command.RunAsync(manageEmployeeAccounts);
        }
        catch (GstockApplicationException error)
        {
            Console.Error.WriteLine(error.Field is null ? error.Message : $"{error.Field}: {error.Message}");
            return 2;
        }
        catch (PostgresException error)
        {
            Console.Error.WriteLine($"PostgreSQL provisioning failed (SQLSTATE {error.SqlState}).");
            return 1;
        }
        catch (NpgsqlException)
        {
            Console.Error.WriteLine("Check the PostgreSQL server and provisioning connection settings.");
            return 1;
        }
        catch (EndOfStreamException)
        {
            Console.Error.WriteLine("Employee provisioning input ended.");
            return 2;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Employee provisioning failed ({error.GetType().Name}).");
            return 1;
        }
    }

    private static async Task<int> RunMigrationAsync(string[] args, IConfiguration configuration)
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
