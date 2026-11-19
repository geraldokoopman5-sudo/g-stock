using System.Data.Common;
using Gstock.Api.Modules.Items.Domain;
using Gstock.Api.Shared.Database;
using Npgsql;
using NpgsqlTypes;

namespace Gstock.Api.Modules.Items.Infrastructure;

internal sealed class PostgresItemRepository(NpgsqlDataSource source)
{
    private const string Columns = "id, brand_id, warehouse_id, name, sku, quantity, unit, added_at, location, reorder_level";

    public async Task<IReadOnlyList<InventoryItems>> ReadAsync(Guid? id, Guid? warehouseId, Guid? brandId,
        string? query, int limit, int offset, CancellationToken token)
    {
        const string sql = $"""
            SELECT {Columns} FROM public.inventory_items
            WHERE archived_at IS NULL AND (@id IS NULL OR id = @id)
              AND (@warehouse IS NULL OR warehouse_id = @warehouse)
              AND (@brand IS NULL OR brand_id = @brand)
              AND (@query IS NULL OR strpos(public.normalize_key(name), public.normalize_key(@query)) > 0
                   OR strpos(public.normalize_key(sku), public.normalize_key(@query)) > 0)
            ORDER BY name, id LIMIT @limit OFFSET @offset;
            """;
        await using var command = source.CreateCommand(sql)
            .BindNullable("id", NpgsqlDbType.Uuid, id).BindNullable("warehouse", NpgsqlDbType.Uuid, warehouseId)
            .BindNullable("brand", NpgsqlDbType.Uuid, brandId).BindNullable("query", NpgsqlDbType.Text, query)
            .Bind("limit", limit).Bind("offset", offset);
        await using var reader = await command.ExecuteReaderAsync(token);
        var items = new List<InventoryItems>();
        while (await reader.ReadAsync(token))
        {
            items.Add(Read(reader));
        }
        return items;
    }

    public async Task<Guid?> FindBrandAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        const string sql = "SELECT brand_id FROM public.inventory_items WHERE id = @id AND archived_at IS NULL;";
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        return await command.ExecuteScalarAsync(token) as Guid?;
    }

    public async Task<InventoryItems?> LockActiveAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        const string sql = $"""
            SELECT {Columns} FROM public.inventory_items WHERE id = @id AND archived_at IS NULL FOR NO KEY UPDATE;
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? Read(reader) : null;
    }

    public async Task<InventoryItems> InsertAsync(Guid brandId, Guid warehouseId, string name, string? sku,
        int quantity, string unit, string location, int reorderLevel, DbTransaction transaction, CancellationToken token)
    {
        var id = Guid.NewGuid();
        sku ??= $"GST-{id:N}".ToUpperInvariant();
        const string sql = $"""
            INSERT INTO public.inventory_items (id, brand_id, warehouse_id, name, sku, quantity, unit, location, reorder_level)
            VALUES (@id, @brand, @warehouse, @name, @sku, @quantity, @unit, @location, @reorder)
            RETURNING {Columns};
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id)
            .Bind("brand", brandId).Bind("warehouse", warehouseId).Bind("name", name)
            .Bind("sku", sku).Bind("quantity", quantity).Bind("unit", unit)
            .Bind("location", location).Bind("reorder", reorderLevel);
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token))
        {
            throw new InvalidOperationException("PostgreSQL did not return the inserted item.");
        }
        return Read(reader);
    }

    public async Task SetQuantityAsync(Guid id, int quantity, DbTransaction transaction, CancellationToken token)
    {
        const string sql = "UPDATE public.inventory_items SET quantity = @quantity WHERE id = @id;";
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id).Bind("quantity", quantity);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task ArchiveAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        const string sql = "UPDATE public.inventory_items SET archived_at = clock_timestamp() WHERE id = @id;";
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        await command.ExecuteNonQueryAsync(token);
    }

    private static InventoryItems Read(NpgsqlDataReader reader) => new(
        reader.GetGuid(0), reader.GetGuid(1), reader.GetGuid(2), reader.GetString(3),
        reader.NullableText(4), reader.GetInt32(5), reader.GetString(6), reader.GetDateTime(7),
        reader.GetString(8), reader.GetInt32(9));
}
