using Gstock.backend.App.Administration;
using Gstock.backend.App.Composition;
using Gstock.backend.App.Composition.ModuleRegistration;
using Gstock.backend.App.Http;
using Gstock.backend.App.Http.HealthEnpoints;

var isAdminCommand = AdminCommandRunner.Handles(args);
var builder = WebApplication.CreateBuilder(isAdminCommand ? Array.Empty<string>() : args);

if (isAdminCommand)
{
    return await AdminCommandRunner.RunAsync(args, builder);
}

builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
// builder.Services.AddDbContext<>
builder.Services.AddApplicationServices(builder.Configuration);
builder.Services.AddModules();

var app = builder.Build();

app.UseRouting();
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages(ExceptionHandler.WriteEmptyResponseAsync);
app.UseHttpsRedirection();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "Gstock API v1");
    });
}

app.MapEndpointHealth();

app.Run();
return 0;
