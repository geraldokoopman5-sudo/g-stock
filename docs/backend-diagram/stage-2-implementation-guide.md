# Gstock Stage 2 implementation guide

Stage 2 is complete when the application can connect to PostgreSQL, roll back a write, and return the agreed API error shape. This guide covers the **12 remaining implementation files**, the startup changes, and the checks that verify those behaviours.

Start from the [Gstock solution folder](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/>). Paths beginning with `App/` or `Shared/` are inside the [Web API project](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/backend/src/Gstock.backend>). Create the named folders as you reach them. The Contracts and test files go in their own projects.

## 1. Prepare the existing files

Rename `PAgeSize` to `PageSize` in both pagination records. The code below uses that spelling, and the API uses `pageSize`. [PageRequest.cs](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/backend/src/Gstock.Contracts/Common/PageRequest.cs>) · [PageResult.cs](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/backend/src/Gstock.Contracts/Common/PageResult.cs>)

Add the two fallback codes inside your existing `ErrorCodes` class. [ErrorCode.cs](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/backend/src/Gstock.Contracts/Common/ErrorCode.cs>)



Add a direct Npgsql reference inside the Web API project's package `ItemGroup`. Version 10.0.3 matches the version already resolved by your project. This guide follows the backend design's direct SQL approach. [Web API project file](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/backend/src/Gstock.backend/Gstock.backend.csproj>)

```xml
<PackageReference Include="Npgsql" Version="10.0.3" /> done
```

## 2. Turn exceptions into API errors

A service raises `GstockApplicationException` with a code and a message. The HTTP handler chooses a status and writes your existing `ErrorResponse`. It also formats empty framework responses such as an unmatched route. [ASP.NET Core error handling](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling?view=aspnetcore-10.0)

### `Shared/Persistence/DatabaseErrorMapper.cs`

Translate a PostgreSQL unique constraint violation into the Gstock duplicate code. The public message contains only the explanation you wrote here.
        
```csharp
using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;
using Npgsql;

namespace Gstock.backend.Shared.Persistence;

public static class DatabaseErrorMapper
{
    public static GstockApplicationException? TryMap(Exception exception)
    {
        if (exception is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            return new GstockApplicationException(
                ErrorCodes.Duplicate, "A record with those details already exists.");
        }

        return null;
    }
}
```

### `App/Http/ExceptionHandler.cs`

Map expected failures to their documented statuses. Unexpected failures receive a generic 500 response and a log entry with the exception type and request trace ID. The static method provides a body for empty error responses.

```csharp
using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;
using Gstock.backend.Shared.Persistence;
using Microsoft.AspNetCore.Diagnostics;

namespace Gstock.backend.App.Http;

public sealed class ExceptionHandler(ILogger<ExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        var error = exception as GstockApplicationException
            ?? DatabaseErrorMapper.TryMap(exception);

        var status = exception is BadHttpRequestException badRequest
            ? badRequest.StatusCode
            : error?.Code switch
            {
                ErrorCodes.MalformedRequest => 400,
                ErrorCodes.Unauthorized => 401,
                ErrorCodes.Forbidden => 403,
                ErrorCodes.NotFound => 404,
                ErrorCodes.Duplicate or ErrorCodes.StaleQuantity => 409,
                ErrorCodes.ValidationFailed or ErrorCodes.NoChange => 422,
                ErrorCodes.RateLimited => 429,
                _ => 500
            };

        if (status >= 500)
        {
            logger.LogError("Request {TraceId} failed with {ExceptionType}",
                context.TraceIdentifier, exception.GetType().Name);
        }

        var details = error is not null && status < 500
            ? new ErrorDetails(error.Code, error.Message, error.Field)
            : DescribeStatus(status);

        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new ErrorResponse(details), cancellationToken);
        return true;
    }

    public static Task WriteEmptyResponseAsync(StatusCodeContext context)
    {
        var http = context.HttpContext;
        var details = DescribeStatus(http.Response.StatusCode);
        return http.Response.WriteAsJsonAsync(new ErrorResponse(details), http.RequestAborted);
    }

    private static ErrorDetails DescribeStatus(int status) => status switch
    {
        400 => new(ErrorCodes.MalformedRequest, "The request is invalid."),
        401 => new(ErrorCodes.Unauthorized, "Sign in to continue."),
        403 => new(ErrorCodes.Forbidden, "You do not have access to this operation."),
        404 => new(ErrorCodes.NotFound, "The requested resource was not found."),
        429 => new(ErrorCodes.RateLimited, "Too many requests. Try again later."),
        >= 500 => new(ErrorCodes.InternalError, "An unexpected error occurred."),
        _ => new(ErrorCodes.RequestFailed, "The request could not be completed.")
    };
}
```

## 3. Validate and normalise common inputs

### `Shared/Validation/TextNormalization.cs`

Use `Required` for ordinary required text and `Optional` for optional fields. `CatalogKey` normalises warehouse names, brand names, and SKUs for matching. Passwords keep the exact characters supplied. Match the catalogue key rule when you add database uniqueness in Stage 3. [Text and catalogue rules](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/docs/backend-and-database-schema.md:251>)

```csharp
using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;

namespace Gstock.backend.Shared.Validation;

public static class TextNormalization
{
    public static string? Optional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static string Required(string? value, string field) =>
        Optional(value) ?? throw new GstockApplicationException(
            ErrorCodes.ValidationFailed, "Enter a value.", field);

    public static string? CatalogKey(string? value)
    {
        var text = Optional(value);
        if (text is null)
        {
            return null;
        }

        var words = text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(" ", words).ToLowerInvariant();
    }
}
```

### `Shared/Validation/PaginationRules.cs`

`GetOffset` validates the page and tells the database how many matching rows to skip. `CreateResult` wraps the returned rows and the total for the same filter. Positions start at 1, and an empty page uses `Start = End = 0`. The division rounds the page count up without converting to floating point. [API paging rules](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/docs/backend-and-database-schema.md:353>)

```csharp
using Gstock.Contracts.Common;
using Gstock.backend.Shared.Errors;

namespace Gstock.backend.Shared.Validation;

public static class PaginationRules
{
    public static long GetOffset(PageRequest request)
    {
        if (request.Page < 1)
        {
            throw new GstockApplicationException(
                ErrorCodes.ValidationFailed, "Page must be at least 1.", "page");
        }

        if (request.PageSize is not (10 or 20 or 50 or 100))
        {
            throw new GstockApplicationException(
                ErrorCodes.ValidationFailed, "Choose 10, 20, 50, or 100.", "pageSize");
        }

        return ((long)request.Page - 1) * request.PageSize;
    }

    public static PageResult<T> CreateResult<T>(
        PageRequest request, IReadOnlyList<T> items, long total)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(total);
        var offset = GetOffset(request);
        var pageCount = total / request.PageSize
            + (total % request.PageSize == 0 ? 0 : 1);
        var start = items.Count == 0 ? 0 : offset + 1;
        var end = items.Count == 0 ? 0 : offset + items.Count;

        return new PageResult<T>(
            items, request.Page, request.PageSize, pageCount, total, start, end);
    }
}
```

## 4. Define configuration and PostgreSQL access

### `App/Configuration/DatabaseOptions.cs`

This type receives the `Database:ConnectionString` setting. Set the actual value in your local terminal during the checks below.

```csharp
namespace Gstock.backend.App.Configuration;

public sealed class DatabaseOptions
{
    public string ConnectionString { get; init; } = string.Empty;
}
```

### `App/Configuration/AuthOptions.cs`

This holds the lifetimes and token audience from the design. Stage 4 supplies the issuer and uses these values during sign-in and token validation. [Authentication policy](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/docs/backend-and-database-schema.md:67>)

```csharp
namespace Gstock.backend.App.Configuration;

public sealed class AuthOptions
{
    public string Issuer { get; init; } = string.Empty;
    public string Audience { get; init; } = "gstock-api";
    public TimeSpan AccessTokenLifetime { get; init; } = TimeSpan.FromMinutes(10);
    public TimeSpan SessionLifetime { get; init; } = TimeSpan.FromHours(8);
    public TimeSpan SessionIdleLimit { get; init; } = TimeSpan.FromHours(1);
    public TimeSpan RememberMeLifetime { get; init; } = TimeSpan.FromDays(30);
    public TimeSpan RememberMeIdleLimit { get; init; } = TimeSpan.FromDays(7);
}
```

### `App/Configuration/OriginOptions.cs`

This holds the exact scheme, host, and port allowed for browser origins. Fill it with your frontend origins when you wire the Stage 4 origin checks.

```csharp
namespace Gstock.backend.App.Configuration;

public sealed class OriginOptions
{
    public string[] AllowedOrigins { get; init; } = [];
}
```

### `Shared/Persistence/PostgresConnectionFactory.cs`

The factory borrows an open connection from the application's Npgsql data source. The data source owns the connection pool. The caller disposes each borrowed connection. [Npgsql connections and pooling](https://www.npgsql.org/doc/basic-usage.html)

```csharp
using Npgsql;

namespace Gstock.backend.Shared.Persistence;

public sealed class PostgresConnectionFactory(NpgsqlDataSource dataSource)
{
    public ValueTask<NpgsqlConnection> OpenAsync(
        CancellationToken cancellationToken = default) =>
        dataSource.OpenConnectionAsync(cancellationToken);
}
```

### `Shared/Persistence/PostgresUnitOfWork.cs`

Open one connection and one transaction per write workflow. The coordinator passes the same unit of work to each participating repository. It calls `CommitAsync` after every write succeeds. Npgsql rolls back a pending transaction when it is disposed, so use `await using` for the workflow lifetime. [Npgsql transaction disposal](https://www.npgsql.org/doc/api/Npgsql.NpgsqlTransaction.html#Npgsql_NpgsqlTransaction_DisposeAsync)

```csharp
using System.Data.Common;
using Gstock.Contracts.Common;

namespace Gstock.backend.Shared.Persistence;

public sealed class PostgresUnitOfWork : IUnitOfWork
{
    private PostgresUnitOfWork(DbConnection connection, DbTransaction transaction)
    {
        Connection = connection;
        Transaction = transaction;
    }

    public DbConnection Connection { get; }
    public DbTransaction Transaction { get; }

    public static async Task<PostgresUnitOfWork> BeginAsync(
        PostgresConnectionFactory connections,
        CancellationToken cancellationToken = default)
    {
        var connection = await connections.OpenAsync(cancellationToken);
        try
        {
            var transaction = await connection.BeginTransactionAsync(cancellationToken);
            return new PostgresUnitOfWork(connection, transaction);
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    public Task CommitAsync(CancellationToken cancellationToken = default) =>
        Transaction.CommitAsync(cancellationToken);

    public Task RollbackAsync(CancellationToken cancellationToken = default) =>
        Transaction.RollbackAsync(cancellationToken);

    public async ValueTask DisposeAsync()
    {
        try
        {
            await Transaction.DisposeAsync();
        }
        finally
        {
            await Connection.DisposeAsync();
        }
    }
}
```

### `Shared/Persistence/SqlReadExecutor.cs`

Use this for standalone reads. Give it SQL defined in your repository, fresh parameters, and a function that turns each row into a result. Put user values in parameters such as `$1`. When a read must see writes inside an active workflow, use that workflow's connection and transaction. [Npgsql parameters and transactions](https://www.npgsql.org/doc/basic-usage.html)

```csharp
using Npgsql;

namespace Gstock.backend.Shared.Persistence;

public sealed class SqlReadExecutor(PostgresConnectionFactory connections)
{
    public async Task<IReadOnlyList<T>> QueryAsync<T>(
        string sql,
        IReadOnlyList<NpgsqlParameter> parameters,
        Func<NpgsqlDataReader, T> mapRow,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);

        foreach (var parameter in parameters)
        {
            command.Parameters.Add(parameter);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<T>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(mapRow(reader));
        }

        return rows;
    }
}
```

## 5. Add request logging

### `Shared/Observability/LogRedaction.cs`

Use the route template, such as `/api/v1/items/{id}`, as the log label. Select a standard HTTP method or use `OTHER`.

```csharp
namespace Gstock.backend.Shared.Observability;

public static class LogRedaction
{
    public static string RouteTemplate(HttpContext context) =>
        (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "(unmatched)";

    public static string RequestMethod(string method) => method switch
    {
        "GET" or "POST" or "PUT" or "PATCH" or "DELETE" or "HEAD" or "OPTIONS" => method,
        _ => "OTHER"
    };
}
```

### `App/Http/RequestLoggingMiddleware.cs`

Record one line for a completed request with the method, route template, status, and duration. This runs around the exception handler so the logged status includes handled errors.

```csharp
using System.Diagnostics;
using Gstock.backend.Shared.Observability;

namespace Gstock.backend.App.Http;

public sealed class RequestLoggingMiddleware(
    RequestDelegate next,
    ILogger<RequestLoggingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var startedAt = Stopwatch.GetTimestamp();
        var route = LogRedaction.RouteTemplate(context);
        var method = LogRedaction.RequestMethod(context.Request.Method);

        await next(context);

        logger.LogInformation(
            "{Method} {Route} returned {StatusCode} in {ElapsedMs:F1} ms",
            method, route, context.Response.StatusCode,
            Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds);
    }
}
```

## 6. Wire the files into the application

Replace the contents of your service registration file with this version. It binds the options, gives the application one PostgreSQL data source, and registers the HTTP error handler. Create a unit of work with `BeginAsync` each time a workflow needs a transaction. [ServiceRegistration.cs](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/backend/src/Gstock.backend/App/Composition/ServiceRegistration.cs>)

```csharp
using Gstock.Contracts.Common;
using Gstock.backend.Shared.Time;
using Gstock.backend.Shared.Ids;
using Gstock.backend.Shared.Identity;
using Gstock.backend.App.Configuration;
using Gstock.backend.App.Http;
using Gstock.backend.Shared.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Gstock.backend.App.Composition;
public static class ServiceRegistration
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddHealthChecks();
        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IIdGenerator, UuidGenerator>();
        services.AddHttpContextAccessor();
        services.AddScoped<IRequestIdentity, CurrentRequestIdentity>();
        services.AddOptions<DatabaseOptions>()
            .Bind(configuration.GetSection("Database"))
            .Validate(options => !string.IsNullOrWhiteSpace(options.ConnectionString),
                "Set Database:ConnectionString.")
            .ValidateOnStart();
        services.Configure<AuthOptions>(configuration.GetSection("Auth"));
        services.Configure<OriginOptions>(configuration.GetSection("Origins"));

        services.AddSingleton(provider =>
        {
            var options = provider.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            return NpgsqlDataSource.Create(options.ConnectionString);
        });
        services.AddSingleton<PostgresConnectionFactory>();
        services.AddSingleton<SqlReadExecutor>();

        services.AddProblemDetails();
        services.AddExceptionHandler<ExceptionHandler>();

        return services;
    }
}
```

In your startup file, add the hosting log filter after `WebApplication.CreateBuilder(args)`. This suppresses the framework's informational request URL logging. Your request middleware writes the route template instead. [Program.cs](<C:/Users/Geraldo/Documents/Github repos/G-stock/g-stock/backend/src/Gstock.backend/Program.cs>)

```csharp
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
```

Pass configuration to the registration call.

```csharp
builder.Services.AddApplicationServices(builder.Configuration);
```

Place this block immediately after `var app = builder.Build();`. Move the existing HTTPS redirection call into this block. Your Swagger setup follows this block, then the health mapping and `app.Run()`.

```csharp
app.UseRouting();
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages(ExceptionHandler.WriteEmptyResponseAsync);
app.UseHttpsRedirection();
```

Routing resolves the template before logging starts. The exception handler catches failures from the endpoints. Status code pages supply the Gstock response for empty HTTP errors. [ASP.NET Core exception handling and status code pages](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling?view=aspnetcore-10.0)

## 7. Add the Stage 2 checks

### `backend/tests/Gstock.IntegrationTests/Fixtures/PostgresFixture.cs`

The fixture provides a PostgreSQL connection pool for integration tests. It reads the test connection string from `GSTOCK_TEST_POSTGRES`.

```csharp
using Gstock.backend.Shared.Persistence;
using Npgsql;

namespace Gstock.IntegrationTests.Fixtures;

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly NpgsqlDataSource _dataSource;

    public PostgresFixture()
    {
        var connectionString = Environment.GetEnvironmentVariable("GSTOCK_TEST_POSTGRES");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("Set GSTOCK_TEST_POSTGRES for database tests.");
        }

        _dataSource = NpgsqlDataSource.Create(connectionString);
        Connections = new PostgresConnectionFactory(_dataSource);
    }

    public PostgresConnectionFactory Connections { get; }

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync() => _dataSource.DisposeAsync().AsTask();
}
```

### `backend/tests/Gstock.IntegrationTests/Database/PostgresUnitOfWorkTests.cs`

This test opens a real connection, writes a temporary table and row inside the unit of work, rolls it back, and checks that the temporary table disappeared. It can run before the Gstock schema exists.

```csharp
using Gstock.backend.Shared.Persistence;
using Gstock.IntegrationTests.Fixtures;

namespace Gstock.IntegrationTests.Database;

public sealed class PostgresUnitOfWorkTests(PostgresFixture postgres)
    : IClassFixture<PostgresFixture>
{
    [Fact]
    public async Task RollbackRemovesTheTemporaryWrite()
    {
        await using var work = await PostgresUnitOfWork.BeginAsync(postgres.Connections);
        await using var command = work.Connection.CreateCommand();
        command.Transaction = work.Transaction;
        command.CommandText = "CREATE TEMP TABLE gstock_stage2_probe AS SELECT 1 AS id";
        await command.ExecuteNonQueryAsync();

        await work.RollbackAsync();
        command.Transaction = null;
        command.CommandText = "SELECT to_regclass('pg_temp.gstock_stage2_probe') IS NULL";

        Assert.True(await command.ExecuteScalarAsync() is true);
    }
}
```

### `backend/tests/Gstock.ArchitectureTests/ModuleBoundaryTests.cs`

This first boundary check guards the compiled Contracts assembly against dependencies on the Web API, ASP.NET Core, and Npgsql. Module-specific checks grow as you implement the modules.

```csharp
using Gstock.Contracts.Common;

namespace Gstock.ArchitectureTests;

public sealed class ModuleBoundaryTests
{
    [Fact]
    public void ContractsStayIndependentOfTheHostAndDatabaseProvider()
    {
        var references = typeof(IClock).Assembly.GetReferencedAssemblies();

        Assert.DoesNotContain(references, reference =>
            reference.Name is "Gstock.backend" or "Npgsql"
            || reference.Name?.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal) == true);
    }
}
```

## 8. Verify the finish line

Use an existing local PostgreSQL database or create an empty one for development. Use a local account that can connect and create temporary tables. The Stage 3 migrations will create the Gstock tables.

From the solution folder in **PowerShell 7**, enter your local connection string at the masked prompt. A connection string has the form `Host=localhost;Port=5432;Database=gstock_dev;Username=YOUR_USER;Password=YOUR_PASSWORD`. The environment variables apply to this terminal and supply configuration to the host and tests. [ASP.NET Core configuration and secrets](https://learn.microsoft.com/en-us/aspnet/core/security/app-secrets?view=aspnetcore-10.0)

```powershell
$env:Database__ConnectionString = Read-Host "Local PostgreSQL connection string" -MaskInput
$env:GSTOCK_TEST_POSTGRES = $env:Database__ConnectionString

dotnet build Gstock.sln
dotnet test backend/tests/Gstock.ArchitectureTests --no-build
dotnet test backend/tests/Gstock.IntegrationTests --no-build --filter "FullyQualifiedName~PostgresUnitOfWorkTests"
```

After the tests pass, add these imports temporarily to `Program.cs`.

```csharp
using Gstock.Contracts.Common;
using Gstock.backend.Shared.Persistence;
using Gstock.backend.Shared.Validation;
using Npgsql;
```

Add the two probes inside the existing `if (app.Environment.IsDevelopment())` block. The database probe runs a parameterised query through the host. The error probe deliberately requests an unsupported page size.

```csharp
app.MapGet("/stage2/db", async (SqlReadExecutor reads, CancellationToken ct) =>
{
    var rows = await reads.QueryAsync(
        "SELECT $1::integer",
        [new NpgsqlParameter { Value = 1 }],
        row => row.GetInt32(0),
        ct);

    return Results.Ok(rows.Single());
});

app.MapGet("/stage2/error", () =>
    Results.Ok(PaginationRules.GetOffset(new PageRequest(1, 13))));
```

Run the API in the same terminal so it receives the database setting.

```powershell
dotnet run --project backend/src/Gstock.backend --launch-profile https
```

Open [the database probe](https://localhost:7151/stage2/db) and check that it returns `1`. Use the HTTPS port shown in your terminal if it has changed. In a second terminal, check the error response and an unmatched route.

```powershell
curl.exe -i https://localhost:7151/stage2/error
curl.exe -i https://localhost:7151/stage2/missing
```

The first request returns HTTP 422 with this body.

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Choose 10, 20, 50, or 100.",
    "field": "pageSize"
  }
}
```

The second returns HTTP 404 with `error.code` set to `not_found`. Check that the server logs show the route template and response status.

Stop the API with `Ctrl+C`, then remove the two temporary probes and their four imports. Build and start the API again in the same terminal. Confirm [the health endpoint](https://localhost:7151/health) returns `Healthy`. Once the database query, rollback test, boundary test, and error checks pass, start **Stage 3 — Database migrations and the administration command**.
