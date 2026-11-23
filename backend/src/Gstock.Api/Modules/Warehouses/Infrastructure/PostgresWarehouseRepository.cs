using System.Data.Common;
using Gstock.Api.Modules.Warehouses.Application;
using Gstock.Api.Modules.Warehouses.Domain;
using Gstock.Api.Shared.Database;
using Npgsql;

namespace Gstock.Api.Modules.Warehouses.Infrastructure;

internal sealed class PostgresWarehouseRepository(NpgsqlDataSource dataSource)
    : IWarehouseRepository
{
    public async Task<IReadOnlyList<Warehouse>> ListAsync(CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT id, name, street_name, suburb_name, city, province, postal_code, contact_name, contact_email, notes
            FROM public.warehouses
            WHERE archived_at IS NULL
            ORDER BY name, id;
            """;

        await using var command = dataSource.CreateCommand(sql);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var warehouses = new List<Warehouse>();

        while (await reader.ReadAsync(cancellationToken))
        {
            warehouses.Add(ReadWarehouse(reader));
        }

        return warehouses;
    }

    public async Task<Warehouse?> FindAsync(Guid id, CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT id, name, street_name, suburb_name, city, province, postal_code, contact_name, contact_email, notes
            FROM public.warehouses WHERE id = @id AND archived_at IS NULL;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadWarehouse(reader) : null;
    }

    private static Warehouse ReadWarehouse(NpgsqlDataReader reader) => new()
    {
        Id = reader.GetGuid(0),
        Name = reader.GetString(1),
        StreetName = reader.GetString(2),
        SuburbName = reader.GetString(3),
        City = reader.GetString(4),
        Province = reader.GetString(5),
        PostalCode = reader.GetInt32(6),
        ContactName = reader.GetString(7),
        ContactEmail = reader.GetString(8),
        Notes = reader.GetString(9)
    };

    public async Task<string?> LockActiveAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        // NO KEY UPDATE allows audit foreign-key checks while existing item writes finish.
        const string sql = "SELECT name FROM public.warehouses WHERE id = @id AND archived_at IS NULL FOR NO KEY UPDATE;";
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        return await command.ExecuteScalarAsync(token) as string;
    }

    public async Task<IReadOnlyList<Guid>> LockActiveBrandsAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        const string sql = """
            SELECT id FROM public.brands WHERE warehouse_id = @id AND archived_at IS NULL
            ORDER BY id FOR NO KEY UPDATE;
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        await using var reader = await command.ExecuteReaderAsync(token);
        var ids = new List<Guid>();
        while (await reader.ReadAsync(token)) ids.Add(reader.GetGuid(0));
        return ids;
    }

    public async Task ArchiveAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        await using var command = PostgresCommand.InTransaction(transaction,
            "UPDATE public.warehouses SET archived_at = clock_timestamp() WHERE id = @id;").Bind("id", id);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task AddAsync(
        Warehouse warehouse,
        DbTransaction transaction,
        CancellationToken cancellationToken)
    {
        if (transaction is not NpgsqlTransaction { Connection: { } connection } postgresTransaction)
        {
            throw new InvalidOperationException("An active PostgreSQL transaction is required.");
        }

        const string sql = """
            INSERT INTO public.warehouses (
                id, name, street_name, suburb_name, city, province, postal_code, contact_name, contact_email, notes
            )
            VALUES (@id, @name, @street_name, @suburb_name, @city, @province, @postal_code, @contact_name, @contact_email, @notes);
            """;

        await using var command = new NpgsqlCommand(sql, connection, postgresTransaction);
        command.Parameters.AddWithValue("id", warehouse.Id);
        command.Parameters.AddWithValue("name", warehouse.Name);
        command.Parameters.AddWithValue("street_name", warehouse.StreetName);
        command.Parameters.AddWithValue("suburb_name", warehouse.SuburbName);
        command.Parameters.AddWithValue("city", warehouse.City);
        command.Parameters.AddWithValue("province", warehouse.Province);
        command.Parameters.AddWithValue("postal_code", warehouse.PostalCode);
        command.Parameters.AddWithValue("contact_name", warehouse.ContactName);
        command.Parameters.AddWithValue("contact_email", warehouse.ContactEmail);
        command.Parameters.AddWithValue("notes", warehouse.Notes);

        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
