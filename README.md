<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="Gstock/public/gstock-logo-dark.svg">
    <img src="Gstock/public/gstock-logo.svg" alt="G-Stock logo" width="258" height="96">
  </picture>
</p>

# G-Stock

**A full-stack inventory and employee management application.**

G-Stock gives a team one place to manage warehouse stock and staff accounts. Employees can record stock changes, stock managers can organise brands and warehouses, and staff managers can manage employee access.

## What it does

- **Inventory management:** organise products by warehouse and brand, track quantities and storage locations, and upload product pictures.
- **Low-stock alerts:** highlight items that reach their reorder level so staff can see what needs replenishing.
- **Employee accounts:** create accounts, update employee details, and assign Employee, Stock Manager, or Staff Manager access.
- **Activity history:** record stock changes and employee account edits for traceability.
- **Staff workspace:** provide light and dark themes and restore the current workspace when a signed-in user reloads the page.

For example, an employee can update a product's quantity after a delivery. The saved quantity is shared through the database, and its low-stock alert clears once the quantity rises above the reorder level.

## Built with

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, CSS |
| Backend | C#, ASP.NET Core (.NET 10), REST API |
| Database | PostgreSQL, SQL migrations, Npgsql |
| Authentication | JWT access tokens, HttpOnly refresh cookies, Argon2id password hashing |
| Deployment configuration | Vercel frontend, Docker-based Render backend |

The React frontend calls the API at `/api/v1`. The backend validates requests, enforces account permissions, and stores data in PostgreSQL.

## Engineering highlights

- **Full-stack integration:** connect a typed React interface to a C# API and a relational database.
- **Access control:** enforce role permissions in the API as well as the interface, with session revocation when an account type changes.
- **Data integrity:** use database transactions and stock validation to handle concurrent changes and prevent deletion of inventory that still holds stock.
- **Session handling:** support token renewal, CSRF protection, logout, and recovery from temporary connection failures.
- **Testing:** include automated frontend tests and backend integration checks for authentication, permissions, stock operations, and account changes.

## Run locally

You need **Node.js 24**, the **.NET 10 SDK**, and **PostgreSQL**. The backend setup scripts also use **PowerShell 7.2+**.

1. Follow the [backend setup guide](backend/README.md) to configure your local database, apply migrations, and create development manager accounts.
2. From the repository root, start the API:

   ```powershell
   dotnet run --project ./backend/src/Gstock.Api --launch-profile http
   ```

3. In a second terminal, start the frontend:

   ```powershell
   cd Gstock
   npm.cmd ci
   npm.cmd run dev
   ```

Open the localhost URL printed by Vite, usually `http://localhost:5173`, and sign in with a provisioned development account. On macOS or Linux, use `npm` in place of `npm.cmd` for the frontend commands.

## Explore the code

- [Frontend](Gstock/src) — React components, API client, and workspace behaviour.
- [Backend](backend/src/Gstock.Api) — API modules for authentication, employees, warehouses, brands, items, and activity.
- [Database migrations](backend/migrations) — database schema and incremental changes.
- [Frontend and deployment guide](Gstock/README.md) — detailed usage, checks, and hosting instructions.
- [Backend guide](backend/README.md) — database setup, account provisioning, and backend checks.
