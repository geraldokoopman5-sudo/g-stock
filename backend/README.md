# G-Stock backend

Run these commands from the folder containing `Gstock.sln`. Local development uses the .NET 10 SDK, PostgreSQL, and PowerShell 7.2 or newer for the scripts.

## Configure and migrate PostgreSQL

Create an empty database named `gstock_dev` if it does not exist. Put your local connection string in `backend/src/Gstock.Api/appsettings.Local.json`. This file is ignored by Git and is read in Development when no other `ConnectionStrings:DefaultConnection` is configured.

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=gstock_dev;Username=postgres;Password=YOUR_LOCAL_PASSWORD"
  }
}
```

```powershell
dotnet run --project .\backend\src\Gstock.Api --launch-profile http -- --check-db
dotnet run --project .\backend\src\Gstock.Api --launch-profile http -- --migrate
```

The migration command applies pending SQL files from `backend/migrations` in filename order. It records each applied file in `public.schema_migrations`.

The integrated frontend requires `003_frontend_fields.sql`. This additive migration persists employee departments, warehouse contacts and notes, item storage locations, and low-stock thresholds. Existing records receive empty text fields and a zero threshold. Apply it before running the updated API.

Picture uploads also require `004_inventory_photos.sql`. It adds optional item picture bytes and picture-update timestamps for items and brands, reusing the existing brand `profile_photo` field. The normal migration command above applies both migrations. PNG and JPEG uploads are limited to 1 MiB. `profilePhoto` is a base64 string in create and `PUT /api/v1/{brands|items}/{id}/photo` requests; null removes a picture on PUT. Stock managers manage brand pictures, normal employees manage item pictures, and all signed-in accounts can read them through the corresponding GET endpoint.

## Run the integrated frontend

Start the API with the `http` launch profile (`http://localhost:5268`), then run `npm.cmd ci` and `npm.cmd run dev` from `Gstock`. Open Vite's **localhost** URL. Its `/api` proxy preserves the browser origin, allowing the existing same-origin and CSRF protections to work without enabling CORS. See the [workspace README](../Gstock/README.md) for role permissions, session behavior, and deployment setup.

## Create development accounts

Run the corresponding line once for each manager account you still need. These commands also apply pending migrations and set up development token signing if needed. Choose a G-Stock email and password at each prompt.

```powershell
pwsh -NoProfile -File .\backend\scripts\Initialize-DevelopmentAuth.ps1
pwsh -NoProfile -File .\backend\scripts\Initialize-DevelopmentAuth.ps1 -StaffManager
```

## Run the backend smoke test

Create a development certificate if you need one. Then start the API and leave it running.

```powershell
dotnet dev-certs https
dotnet run --project .\backend\src\Gstock.Api --launch-profile https
```

In a second terminal, run the smoke test and enter both manager accounts when prompted.

```powershell
pwsh -NoProfile -File .\backend\scripts\Test-DevelopmentBackend.ps1
```

The test checks the permissions for all three account roles, warehouse and catalogue operations, stock validation and activity, account edits, refresh, and logout. It uses the local HTTPS endpoint so the refresh cookie can be sent. It leaves sample warehouses and activity in the development database, archives the sample catalogue entries, and deactivates its sample employee.
