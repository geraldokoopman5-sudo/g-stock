# Gstock backend

Stage 1 scaffolding for the C# / ASP.NET Core modular monolith.

## Projects

The solution is `../Gstock.sln`.

- `src/Gstock.backend` is the ASP.NET Core Web API and startup project.
- `src/Gstock.Contracts` is the Class Library for public interfaces and data contracts.
- `tests/Gstock.UnitTests`, `tests/Gstock.IntegrationTests` and `tests/Gstock.ArchitectureTests` are xUnit test projects.

The Web API references Contracts. Contracts does not reference the Web API. Each test project references the Web API and Contracts.

## Folders

`Modules/` contains Authentication, Employees, Warehouses, Brands, Inventory, Activity and Reports. Each module has `Api/`, `Application/`, `Domain/` and `Infrastructure/` folders.

`App/Composition/` contains service and module registration placeholders. `App/Http/HealthEndpoints.cs` is the health endpoint placeholder. `Shared/` and `migrations/` are ready for later stages. `.gitkeep` files preserve empty folders in Git.

## Your next work

Implement the three placeholder C# files and wire them into `Program.cs`. The health endpoint and registrations are not implemented yet. Add your own tests as each workflow is implemented.

From the repository root, use:

```text
dotnet build Gstock.sln
dotnet run --project backend/src/Gstock.backend
dotnet test Gstock.sln
```

The first build or test run restores the projects' packages. The SDK selection in `global.json` applies when running commands from within `backend/`; it pins the currently installed .NET 10 SDK patch family. From the repository root, the installed SDK is selected normally.

## Run database migrations on Windows

From the repository root, run:

```powershell
.\backend\migrate.cmd
```

Enter your existing PostgreSQL database name and the password for the `postgres` account. The helper uses `localhost:5432`, prompts for the password with masked input, builds the connection string, and runs the SQL migration command. It works with Windows PowerShell 5.1. It does not create the database; the account must have permission to create tables in it.

For a different PostgreSQL account or server, pass the settings explicitly:

```powershell
.\backend\migrate.cmd -Database gstock -Username my_user -DatabaseHost localhost -Port 5432
```

The password is used for the migration process and is not saved to a configuration file. The wrapper allows this script to run for its own PowerShell process without changing your saved execution policy.
