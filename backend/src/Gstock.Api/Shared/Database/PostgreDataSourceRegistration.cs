using Npgsql;

namespace Gstock.Api.Shared.Database;

internal static class PostgresDataSourceRegistration
{
    public static void AddPostgresDataSource(this IServiceCollection services)
    {
        services.AddSingleton<NpgsqlDataSource>(provider =>
        {
            var configuration = provider.GetRequiredService<IConfiguration>();
            var connectionString = configuration.GetConnectionString("DefaultConnection");
            var environment = provider.GetRequiredService<IHostEnvironment>();

            if (string.IsNullOrWhiteSpace(connectionString) && environment.IsDevelopment())
            {
                using var local = new ConfigurationManager();
                local.SetFileProvider(environment.ContentRootFileProvider);
                local.AddJsonFile("appsettings.Local.json", optional: true);
                connectionString = local.GetConnectionString("DefaultConnection");
            }

            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    "Set ConnectionStrings:DefaultConnection before using PostgreSQL.");
            }

            return NpgsqlDataSource.Create(connectionString);
        });
    }
}
