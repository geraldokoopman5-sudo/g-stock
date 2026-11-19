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

For deployment, serve `dist` and `/api/v1` under the same HTTPS origin using a reverse proxy. Preserve the public host and configure the API's request scheme correctly at the trusted proxy. Cross-origin hosting is incompatible with the API's current cookie and same-origin policy.

## Checks

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
```

Tests cover the existing UI/data helpers plus API credentials, CSRF refresh concurrency, request retries, validation errors, session expiry, and logout. The legacy browser-store helpers remain for their existing tests and fixtures; the application no longer uses them for authentication or persistence.
