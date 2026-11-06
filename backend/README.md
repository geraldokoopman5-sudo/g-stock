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
