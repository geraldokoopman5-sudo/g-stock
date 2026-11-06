using Gstock.backend.App.Composition;
using Gstock.backend.App.Composition.ModuleRegistration;
using Gstock.backend.App.Http;
using Gstock.backend.App.Http.HealthEnpoints;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
// builder.Services.AddDbContext<>
builder.Services.AddApplicationServices();
builder.Services.AddModules();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "Gstock API v1");
    });
}

app.UseHttpsRedirection();
app.MapEndpointHealth();

app.Run();