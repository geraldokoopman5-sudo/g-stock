# G-Stock staff workspace

The React workspace connects to the .NET API at `/api/v1`. Login, employee profiles and edits, warehouses, brands, items, stock adjustments, and activity use PostgreSQL through the API. Existing browser demo data is not imported.

## Run locally

Use Node.js 24 and the .NET 10 SDK. Follow [backend setup](../backend/README.md) to configure PostgreSQL, migrate it, and provision manager accounts. Apply migration `003_frontend_fields.sql` before starting this version; it adds departments, warehouse contact details, stock locations, and reorder levels.

From the repository root, start the backend:

```powershell
dotnet run --project .\backend\src\Gstock.Api --launch-profile http
```

In a second terminal:

```powershell
cd Gstock
npm.cmd ci
npm.cmd run dev
```

Open the localhost URL printed by Vite (normally `http://localhost:5173`). Vite proxies `/api` to `http://localhost:5268`, preserving the original host so the API's same-origin checks work. Use `localhost` for the browser URL. Secure cookies are supported on localhost; deployed environments require HTTPS. `npm.cmd run preview` uses the same API proxy for checking a production build locally.

Sign in with an account provisioned in the backend. A staff manager can create a normal employee through `POST /api/v1/employees` (the existing UI edits accounts but does not create them).

| Account role | Allowed changes |
| --- | --- |
| All active accounts | Create warehouses |
| StockManager | Create brands |
| Nemployee | Create items and adjust quantities |
| StaffManager | Edit normal employee accounts and passwords |

These permissions follow the existing API policy; a manager does not automatically inherit normal employee stock permissions. The API enforces authorization independently of the UI.

## Sessions and deployment

Access tokens remain in memory. The API sets an HttpOnly refresh cookie; session restoration and access-token renewal obtain a CSRF token before rotating the cookie. Remember me is passed to the backend to control session persistence. Logout revokes the session and clears its cookie. Failed requests display API validation, permission, and stock-conflict messages.

For deployment, serve `dist` and `/api/v1` under the same HTTPS origin using a reverse proxy. Preserve the public host and configure the API's request scheme correctly at the trusted proxy. Cross-origin hosting is incompatible with the API's current cookie and same-origin policy.

## Checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
```

Tests cover the existing UI/data helpers plus API credentials, CSRF refresh concurrency, request retries, validation errors, session expiry, and logout. The legacy browser-store helpers remain for their existing tests and fixtures; the application no longer uses them for authentication or persistence.
