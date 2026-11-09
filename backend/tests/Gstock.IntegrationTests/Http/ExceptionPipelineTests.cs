using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Gstock.Contracts.Common;
using Gstock.backend.App.Composition;
using Gstock.backend.App.Http;
using Gstock.backend.Shared.Validation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Gstock.IntegrationTests.Http;

public sealed class ExceptionPipelineTests : IAsyncLifetime
{
    private WebApplication _app = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Production
        });
        // Keep the test host independent of Windows Event Log permissions.
        builder.Logging.ClearProviders().AddConsole();
        builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Database:ConnectionString"] = "Host=localhost;Database=Gstock_test;Username=postgres"
        });
        builder.Services.AddApplicationServices(builder.Configuration);

        _app = builder.Build();
        _app.UseRouting();
        _app.UseMiddleware<RequestLoggingMiddleware>();
        _app.UseExceptionHandler();
        _app.UseStatusCodePages(ExceptionHandler.WriteEmptyResponseAsync);
        _app.MapGet("/validation", () =>
            Results.Ok(PaginationRules.GetOffset(new PageRequest(1, 13))));
        _app.MapGet("/unexpected", (Func<IResult>)(() =>
            throw new InvalidOperationException("private server details")));
        _app.MapGet("/duplicate", (Func<IResult>)(() =>
            throw new PostgresException("private database details", "ERROR", "ERROR",
                PostgresErrorCodes.UniqueViolation)));
        _app.MapGet("/forbidden", () => Results.StatusCode(403));
        await _app.StartAsync();

        var addresses = _app.Services.GetRequiredService<IServer>()
            .Features.Get<IServerAddressesFeature>()!;
        _client = new HttpClient { BaseAddress = new Uri(addresses.Addresses.Single()) };
    }

    [Theory]
    [InlineData("/validation", HttpStatusCode.UnprocessableEntity, ErrorCodes.ValidationFailed)]
    [InlineData("/unexpected", HttpStatusCode.InternalServerError, ErrorCodes.InternalError)]
    [InlineData("/duplicate", HttpStatusCode.Conflict, ErrorCodes.Duplicate)]
    [InlineData("/forbidden", HttpStatusCode.Forbidden, ErrorCodes.Forbidden)]
    [InlineData("/missing", HttpStatusCode.NotFound, ErrorCodes.NotFound)]
    public async Task ErrorsReturnTheAgreedJsonWithoutPrivateDetails(
        string path, HttpStatusCode status, string code)
    {
        using var response = await _client.GetAsync(path);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        var error = body.GetProperty("error");
        Assert.Equal(code, error.GetProperty("code").GetString());
        Assert.DoesNotContain("private", error.GetProperty("message").GetString()!);
        if (path == "/validation")
        {
            Assert.Equal("pageSize", error.GetProperty("field").GetString());
        }
        else
        {
            Assert.False(error.TryGetProperty("field", out _));
        }
    }

    public async Task DisposeAsync()
    {
        _client?.Dispose();
        if (_app is not null)
        {
            await _app.DisposeAsync();
        }
    }
}
