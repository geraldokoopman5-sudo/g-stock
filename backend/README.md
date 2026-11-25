# G-Stock backend

Run these commands from the folder containing `Gstock.sln`. Local development uses the .NET 10 SDK, PostgreSQL, and PowerShell 7.2 or newer for the scripts.

## Configure and migrate PostgreSQL

Create an empty database named `gstock_dev` if it does not exist. Copy `backend/src/Gstock.Api/.env.example` to `.env.local` in the same directory and set your database connection string. The API reads this file only in Development. It is ignored by Git and excluded from build/publish output and Docker contexts. Keep backend secrets in this file; `Gstock/.env.local` belongs to the frontend proxy and must never contain backend credentials.

```dotenv
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=gstock_dev;Username=postgres;Password=YOUR_LOCAL_PASSWORD"
```

Use one `NAME=value` entry per line; `__` maps to nested .NET configuration keys. Blank lines and `#` comments are supported. Single-quoted values are literal; double-quoted values use JSON escaping, including `\n` for multiline PEM keys. Values are never expanded as shell commands or references to other variables. Real environment variables and command-line arguments override `.env.local`; the file overrides appsettings. Restart the API after editing it. The old `appsettings.Local.json` database fallback and project user-secrets registration are no longer used.

In production, configure `ConnectionStrings__DefaultConnection`, `Auth__Issuer`, `Auth__SigningKeyId`, `Auth__PrivateKeyPem`, and `Auth__SigningKeys__<key-id>` in the backend host's environment/secrets settings. Production never loads `.env.local`. Never put passwords or private keys in frontend `VITE_*` variables. Moving a value to a local file does not revoke credentials previously committed to Git: rotate exposed passwords or keys before cleaning history.

```powershell
dotnet run --project .\backend\src\Gstock.Api --launch-profile http -- --check-db
dotnet run --project .\backend\src\Gstock.Api --launch-profile http -- --migrate
```

The migration command applies pending SQL files from `backend/migrations` in filename order. It records each applied file in `public.schema_migrations`.

Apply every migration in order through `008_archive_oxford_sample_brand.sql`. Migration `003_frontend_fields.sql` introduced warehouse contacts and notes, item storage locations, and low-stock thresholds. Existing records receive empty text fields and a zero threshold.

Migration `008_archive_oxford_sample_brand.sql` archives the retired Oxford sample brand and its items by the brand's exact ID and name. This one-time administrative cleanup preserves item quantities and existing history. Normal API deletion still requires zero stock. Databases without that sample brand are unaffected.

Migration `007_inventory_deletion.sql` adds warehouse archiving and its activity event. Normal employees can delete items only at zero stock. Stock managers can delete brands and warehouses only when every active item within them is at zero stock; their remaining zero-stock items and brands are archived in the same transaction. These actions use `DELETE /api/v1/{items|brands|warehouses}/{id}` and preserve records and employee activity history. Warehouse deletion and brand creation are serialized, as are deletion and stock writes, so concurrent changes cannot leave active stock under an archived parent. Apply the migration before starting the updated API. To verify the rules, permissions, history, and concurrent writes against a disposable database, run `node backend/scripts/test-inventory-deletion.mjs` from the repository root.

Picture uploads also require `004_inventory_photos.sql`. It adds optional item picture bytes and picture-update timestamps for items and brands, reusing the existing brand `profile_photo` field. The normal migration command above applies both migrations. PNG and JPEG uploads are limited to 1 MiB. `profilePhoto` is a base64 string in create and `PUT /api/v1/{brands|items}/{id}/photo` requests; null removes a picture on PUT. Stock managers manage brand pictures, normal employees manage item pictures, and all signed-in accounts can read them through the corresponding GET endpoint.

Account-type changes require `005_account_type_edits.sql`, which adds `account_role` to the permitted employee audit fields. `PATCH /api/v1/employees/{id}/account-type` accepts an object such as `{ "accountRole": "StockManager" }`; choices are `Nemployee`, `StockManager`, and `StaffManager`. Only an active Staff Manager can call it, for any account including their own. The account-type and job-title update, audit entry, and revocation of all target sessions commit together. The target signs in again to use its new permissions. The existing profile/password PATCH remains restricted to normal employee targets.

Migration `006_remove_departments_and_sync_job_titles.sql` removes the employee department column and department audit values. Department-only edit entries are removed; other profile edits and password history are preserved. The job-title column `role` becomes a PostgreSQL `public.account_role` enum generated from `account_role`, so it cannot hold an independent value. Existing titles are normalized to the current account type, without changing permissions. API profile `role` uses the same `AccountRoles` enum and JSON values as `accountRole`. Creation derives the title from `accountRole`; a supplied mismatched or unknown title is rejected. Profile PATCH cannot change the title independently; use the Staff Manager account-type endpoint. Deploy this schema and matching backend/frontend as a coordinated update because the old backend expects the previous columns. The migration command above applies it to the configured database; repository changes do not automatically migrate a hosted database.

## Run the integrated frontend

Start the API with the `http` launch profile (`http://localhost:5268`), then run `npm.cmd ci` and `npm.cmd run dev` from `Gstock`. Open Vite's **localhost** URL. Its `/api` proxy preserves the browser origin, allowing the existing same-origin and CSRF protections to work without enabling CORS. See the [workspace README](../Gstock/README.md) for role permissions, session behavior, and deployment setup.

## Create development accounts

Run the corresponding line once for each manager account you still need. These commands also apply pending migrations and generate development JWT signing settings in the backend `.env.local` if absent. Existing keys are preserved. Choose a G-Stock email and password at each prompt; employee passwords are hashed in the database, not stored in `.env.local`.

```powershell
pwsh -NoProfile -File .\backend\scripts\Initialize-DevelopmentAuth.ps1
pwsh -NoProfile -File .\backend\scripts\Initialize-DevelopmentAuth.ps1 -StaffManager
```

## Populate the site with demo data

After applying migrations, run this command against your configured database:

```powershell
dotnet run --project .\backend\src\Gstock.Api --launch-profile http -- --seed-demo
```

This adds 48 fictional employee accounts (39 employees, six stock managers, and three staff managers), five South African warehouses, 30 brands, and 180 products. Stock includes healthy, low, and out-of-stock quantities so the inventory and alerts have useful content. Demo employees use `DEMO-` employee numbers and reserved `@demo.gstock.example` email addresses; warehouse notes identify the sample catalogue.

The command runs only in Development and uses the database configured in the backend environment. It is an explicit import, never part of API startup or migrations. Repeating it preserves existing records, passwords, stock changes, and archives. The import commits in one transaction. Each demo account has its own random, unrecorded password; continue signing in with your existing account. No shared demo login or fabricated activity history is added. Refresh the site after importing.

Run `node backend/scripts/test-demo-seed.mjs` from the repository root to verify the import against a disposable PostgreSQL cluster, including repeat runs, preservation of edits, transaction rollback, and the Production guard. It uses the same PostgreSQL binary requirements as the account-type integration check below.

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

The local environment loader has dependency-free checks for PEM/password escaping, safe errors, configuration precedence and production isolation:

```powershell
dotnet run --project backend/tests/Gstock.Configuration.Tests
```
