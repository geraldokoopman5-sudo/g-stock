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

Apply every migration in order through `006_remove_departments_and_sync_job_titles.sql`. Migration `003_frontend_fields.sql` introduced warehouse contacts and notes, item storage locations, and low-stock thresholds. Existing records receive empty text fields and a zero threshold.

Picture uploads also require `004_inventory_photos.sql`. It adds optional item picture bytes and picture-update timestamps for items and brands, reusing the existing brand `profile_photo` field. The normal migration command above applies both migrations. PNG and JPEG uploads are limited to 1 MiB. `profilePhoto` is a base64 string in create and `PUT /api/v1/{brands|items}/{id}/photo` requests; null removes a picture on PUT. Stock managers manage brand pictures, normal employees manage item pictures, and all signed-in accounts can read them through the corresponding GET endpoint.

Account-type changes require `005_account_type_edits.sql`, which adds `account_role` to the permitted employee audit fields. `PATCH /api/v1/employees/{id}/account-type` accepts an object such as `{ "accountRole": "StockManager" }`; choices are `Nemployee`, `StockManager`, and `StaffManager`. Only an active Staff Manager can call it, for any account including their own. The account-type and job-title update, audit entry, and revocation of all target sessions commit together. The target signs in again to use its new permissions. The existing profile/password PATCH remains restricted to normal employee targets.

Migration `006_remove_departments_and_sync_job_titles.sql` removes the employee department column and department audit values. Department-only edit entries are removed; other profile edits and password history are preserved. The job-title column `role` becomes a PostgreSQL `public.account_role` enum generated from `account_role`, so it cannot hold an independent value. Existing titles are normalized to the current account type, without changing permissions. API profile `role` uses the same `AccountRoles` enum and JSON values as `accountRole`. Creation derives the title from `accountRole`; a supplied mismatched or unknown title is rejected. Profile PATCH cannot change the title independently; use the Staff Manager account-type endpoint. Deploy this schema and matching backend/frontend as a coordinated update because the old backend expects the previous columns. The migration command above applies it to the configured database; repository changes do not automatically migrate a hosted database.

## Run the integrated frontend

The employee-directory GET endpoints (`/api/v1/employees`, `/{id}`, and `/{id}/edits`) check the current database role and are available only to active Stock Managers and Staff Managers. Normal employees receive `403`, including for direct URLs and their own ID in the directory. `/api/v1/auth/me` continues to supply their own profile and advertises `canViewEmployees: false`. Account changes remain Staff Manager-only.

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

For an isolated account-type integration check, run from the repository root:

```powershell
node backend/scripts/test-account-types.mjs
```

This requires Node.js 24, .NET 10, and PostgreSQL binaries (by default `C:/Program Files/PostgreSQL/18/bin`; override with `GSTOCK_POSTGRES_BIN`). It builds the API, creates a disposable local PostgreSQL cluster, applies every migration, and starts the API with generated test JWT keys and test sessions. It checks removal of existing department data, preservation of unrelated audit history, title normalization and enum enforcement, denied actors, validation, all account types, persistence, account creation/login, permission updates, session revocation, and self-demotion. It stops the processes and removes its temporary database afterward. It does not use configured development or hosted database credentials.
