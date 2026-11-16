using Gstock.Api.Modules.Activity.Api;
using Gstock.Api.Modules.Brands.Api;
using Gstock.Api.Modules.Brands.Application;
using Gstock.Api.Modules.Brands.Infrastructure;
using Gstock.Api.Modules.Employees.Api;
using Gstock.Api.Modules.Employees.Application;
using Gstock.Api.Modules.Items.Api;
using Gstock.Api.Modules.Items.Application;
using Gstock.Api.Modules.Items.Infrastructure;
using Gstock.Api.Shared.Api;
using Gstock.Api.App.Administration;
using Gstock.Api.Modules.Activity.Application;
using Gstock.Api.Modules.Activity.Infrastructure;
using Gstock.Api.Modules.Authentication.Api;
using Gstock.Api.Modules.Authentication.Application;
using Gstock.Api.Modules.Authentication.Infrastructure;
using Gstock.Api.Modules.Employees.Infrastructure;
using Gstock.Api.Modules.Warehouses.Api;
using Gstock.Api.Modules.Warehouses.Application;
using Gstock.Api.Modules.Warehouses.Infrastructure;
using Gstock.Api.Shared.Database;
using Gstock.Contracts;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddPostgresDataSource();
builder.Services.AddScoped<IAuthSessionRepository, PostgresAuthSessionRepository>();
builder.Services.AddScoped<IWarehouseRepository, PostgresWarehouseRepository>();
builder.Services.AddScoped<IInventoryActivityRepository, PostgresInventoryActivityRepository>();
builder.Services.AddScoped<IEmployeeDirectory, PostgresEmployeeDirectory>();
builder.Services.AddScoped<PostgresUnitOfWork>();
builder.Services.AddScoped<WarehouseService>();
builder.Services.AddGstockAuthentication(builder.Configuration);
builder.Services.AddGstockLogin();

builder.Services.AddScoped<PostgresBrandRepository>();
builder.Services.AddScoped<BrandService>();
builder.Services.AddScoped<PostgresItemRepository>();
builder.Services.AddScoped<ItemService>();
builder.Services.AddScoped<PostgresEmployeeRepository>();
builder.Services.AddScoped<EmployeeService>();
var app = builder.Build();

if (args is ["--check-db"] or ["--migrate"] or [ProvisionDevelopmentEmployee.StockManagerCommand] or [ProvisionDevelopmentEmployee.StaffManagerCommand])
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
        else if (args[0] is ProvisionDevelopmentEmployee.StockManagerCommand or ProvisionDevelopmentEmployee.StaffManagerCommand)
        {
            var role = args[0] == ProvisionDevelopmentEmployee.StockManagerCommand
                ? AccountRoles.StockManager : AccountRoles.StaffManager;
            Environment.ExitCode = await ProvisionDevelopmentEmployee.RunAsync(dataSource, role);
        }
        else
        {
            await DataBaseConnectionCheck.RunAsync(dataSource);
        }
    }

    return;
}

app.UseGstockApiErrors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/", () => "Hello World!");
app.MapLoginEndpoints();
app.MapWarehouseEndpoints();
app.MapAuthSessionEndpoints();
app.MapEmployeeEndpoints();
app.MapBrandEndpoints();
app.MapItemEndpoints();
app.MapActivityEndpoints();
await app.RunAsync();
