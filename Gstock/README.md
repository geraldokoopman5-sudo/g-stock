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

Open the localhost URL printed by Vite (normally `http://localhost:5173`). Vite proxies `/api/v1` to `http://localhost:5268` by default. Use `localhost` for the browser URL. Secure cookies are supported on localhost; deployed environments require HTTPS. `npm.cmd run preview` uses the same API proxy for checking a production build locally.

To use the hosted Render backend during local frontend development, copy `Gstock/.env.example` to `Gstock/.env.local` and replace the example with the actual Render URL:

```dotenv
API_PROXY_TARGET=https://YOUR-SERVICE.onrender.com
```

Run `npm.cmd run dev` from `Gstock` and restart Vite whenever you change this setting. The target must be the root HTTPS URL without an API path. The proxy translates the host and a matching local browser Origin for the upstream server. It preserves cookies, authorization, CSRF headers, and fetch metadata. Invalid browser origins still reach the API's rejection checks.

Sign in with an account provisioned in the backend. Staff managers can open **Employee accounts → Add employee account** to create an Employee, Stock Manager, or Staff Manager. The form saves through `POST /api/v1/employees` and the new account can sign in immediately.

| Account role | Allowed changes |
| --- | --- |
| StockManager | Create warehouses and brands |
| Nemployee | Create warehouses and items, and adjust quantities |
| StaffManager | Create accounts of all types; edit normal employee accounts and passwords; cannot create warehouses |

These permissions follow the existing API policy; a manager does not automatically inherit normal employee stock permissions. The API enforces authorization independently of the UI.

New stock items receive a SKU automatically when saved; the stock form does not ask for one. The API generates a `GST-` prefix followed by the item's 32 uppercase hexadecimal ID characters, and PostgreSQL enforces SKU uniqueness across all warehouses, including archived items. Existing SKUs are preserved. API clients can still submit an explicit SKU; omitted, null, empty, or whitespace-only SKUs generate one automatically. No database migration is needed.

Explore shows an alert count and a low-stock list for items at or below their configured threshold, including out-of-stock items. Each alert shows the item, SKU, brand, warehouse, storage location, quantity, and threshold. Opening it selects that exact stock item, even when its table row is on another page. Alerts are calculated from persisted inventory and cannot be dismissed; a partial restock or a quantity equal to the threshold keeps the alert, and a quantity strictly above it clears the alert. The list refreshes on opening Explore, every 30 seconds while it is open and visible, and when returning to the window. Failed refreshes retain the last loaded levels with a message.

Brands and stock items accept an optional PNG or JPEG picture up to 1 MiB, with a preview before saving. Stock managers can add, replace, or remove a brand picture on its inventory page; normal employees can do the same for an item from its row or detail card. Pictures are stored as PostgreSQL `bytea`, sent as base64 in `profilePhoto`, and fetched separately through authenticated `/brands/{id}/photo` and `/items/{id}/photo` endpoints. Catalog responses include `hasProfilePhoto` and `photoUpdatedAt` without loading image bytes. Apply migration `004_inventory_photos.sql` before running this version.

## Sessions and deployment

Access tokens remain in memory. The API sets an HttpOnly refresh cookie; session restoration and access-token renewal obtain a CSRF token before rotating the cookie. Remember me is passed to the backend to control session persistence. Logout revokes the session and clears its cookie. Failed requests display API validation, permission, and stock-conflict messages.

### Render backend and Vercel frontend

Deploy the backend to Render using `backend/Dockerfile`. Set the database and JWT variables from the backend deployment guide, including `ASPNETCORE_ENVIRONMENT=Production` and `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`. Apply all SQL migrations locally against the Supabase database before starting the current backend. The migrations and manager provisioning commands run in Development.

In Vercel, import this repository with these settings:

| Setting | Value |
| --- | --- |
| Root Directory | `Gstock` |
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 24.x |
| Environment variable | `API_PROXY_TARGET=https://YOUR-SERVICE.onrender.com` |

Set the variable for each Vercel environment that should call this backend, then deploy. The value is the backend's root HTTPS URL. Vercel runs `api/[...path].js` for `/api/v1/*` requests using the configuration in `vercel.json`. Access tokens, cookies, JSON uploads, validation errors, and binary pictures pass through the proxy. Supabase credentials and JWT signing keys belong in the backend hosting environment.

The browser always calls relative `/api/v1` URLs on the frontend origin. The proxy validates the incoming browser Origin and fetch metadata before translating the Origin for the backend. The HttpOnly, Secure refresh cookie is stored on the frontend host, which lets refresh and logout work with the existing SameSite policy. The API keeps enforcing its CSRF token checks and session validation. No browser CORS allowlist is required for this proxy arrangement.

The proxy returns a configuration error if `API_PROXY_TARGET` is missing, and an availability error if Render cannot respond within 55 seconds. A sleeping Render Free service can take around a minute to wake. Retry after it has started. API responses through the hosted proxy are marked `no-store`.

After deploying, sign in with a persisted employee, reload the page to verify session restoration, save an authorized warehouse or stock change, check that it appears after reloading, and log out. Confirm a second account sees the saved catalogue and activity. Local development can use the same backend by setting `Gstock/.env.local` as described above.

## Checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
```

Tests cover the existing UI/data helpers plus API credentials, CSRF refresh concurrency, request retries, validation errors, session expiry, and logout. The legacy browser-store helpers remain for their existing tests and fixtures; the application no longer uses them for authentication or persistence.
