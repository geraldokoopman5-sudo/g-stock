using Gstock.Api.Modules.Warehouses.Application;
using Gstock.Api.Modules.Warehouses.Infrastructure;
using Gstock.Api.Shared.Database;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddPostgresDataSource();
builder.Services.AddScoped<IWarehouseRepository, PostgresWarehouseRepository>();

var app = builder.Build();

if (args is ["--check-db"] or ["--migrate"])
{
    await using (app)
    {
        if (!app.Environment.IsDevelopment())
        {
            throw new InvalidOperationException("Run database commands in Development.");
        }

        var dataSource = app.Services.GetRequiredService<NpgsqlDataSource>();
        if (args[0] == "--migrate")
        {
            await SqlMigrationRunner.RunAsync(dataSource);
        }
        else
        {
            await DataBaseConnectionCheck.RunAsync(dataSource);
        }
    }

    return;
}

app.MapGet("/", () => "Hello World!");
await app.RunAsync();
