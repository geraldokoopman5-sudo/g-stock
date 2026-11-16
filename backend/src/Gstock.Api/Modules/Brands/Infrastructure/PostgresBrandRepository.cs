using System.Data.Common;
using Gstock.Api.Modules.Brands.Domain;
using Gstock.Api.Shared.Database;
using Npgsql;
using NpgsqlTypes;

namespace Gstock.Api.Modules.Brands.Infrastructure;

internal sealed class PostgresBrandRepository(NpgsqlDataSource source)
{
    public async Task<IReadOnlyList<Brand>> ReadAsync(
        Guid? id, Guid? warehouseId, string? query, int limit, int offset, CancellationToken token)
    {
        const string sql = """
            SELECT id, warehouse_id, brand_name, description, date_added, profile_photo IS NOT NULL
            FROM public.brands
            WHERE archived_at IS NULL AND (@id IS NULL OR id = @id)
              AND (@warehouse IS NULL OR warehouse_id = @warehouse)
              AND (@query IS NULL OR strpos(public.normalize_key(brand_name), public.normalize_key(@query)) > 0)
            ORDER BY brand_name, id LIMIT @limit OFFSET @offset;
            """;
        await using var command = source.CreateCommand(sql)
            .BindNullable("id", NpgsqlDbType.Uuid, id).BindNullable("warehouse", NpgsqlDbType.Uuid, warehouseId)
            .BindNullable("query", NpgsqlDbType.Text, query).Bind("limit", limit).Bind("offset", offset);
        await using var reader = await command.ExecuteReaderAsync(token);
        var brands = new List<Brand>();
        while (await reader.ReadAsync(token))
        {
            brands.Add(new Brand(reader.GetGuid(0), reader.GetGuid(1), reader.GetString(2),
                reader.GetString(3), reader.GetDateTime(4), reader.GetBoolean(5)));
        }
        return brands;
    }

    public async Task<byte[]?> ReadPhotoAsync(Guid id, CancellationToken token)
    {
        const string sql = "SELECT profile_photo FROM public.brands WHERE id = @id AND archived_at IS NULL;";
        await using var command = source.CreateCommand(sql).Bind("id", id);
        return await command.ExecuteScalarAsync(token) as byte[];
    }

    public async Task<Brand> InsertAsync(Guid warehouseId, string name, string description, byte[]? photo,
        DbTransaction transaction, CancellationToken token)
    {
        // A missing warehouse leaves the SELECT empty and inserts no brand.
        const string sql = """
            INSERT INTO public.brands (id, warehouse_id, brand_name, description, profile_photo)
            SELECT @id, id, @name, @description, @photo FROM public.warehouses WHERE id = @warehouse
            RETURNING date_added;
            """;
        var id = Guid.NewGuid();
        await using var command = PostgresCommand.InTransaction(transaction, sql)
            .Bind("id", id).Bind("warehouse", warehouseId).Bind("name", name).Bind("description", description)
            .BindNullable("photo", NpgsqlDbType.Bytea, photo);
        if (await command.ExecuteScalarAsync(token) is not DateTime added)
        {
            throw Shared.Api.ApiError.Missing("Warehouse");
        }
        return new Brand(id, warehouseId, name, description, added, photo is not null);
    }

    public async Task<(Guid WarehouseId, string Name)?> LockActiveAsync(
        Guid id, DbTransaction transaction, CancellationToken token)
    {
        const string sql = """
            SELECT warehouse_id, brand_name FROM public.brands
            WHERE id = @id AND archived_at IS NULL FOR NO KEY UPDATE;
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? (reader.GetGuid(0), reader.GetString(1)) : null;
    }

    public async Task<bool> TryArchiveAsync(Guid id, DbTransaction transaction, CancellationToken token)
    {
        const string sql = """
            UPDATE public.brands SET archived_at = clock_timestamp()
            WHERE id = @id AND NOT EXISTS (
                SELECT 1 FROM public.inventory_items WHERE brand_id = @id AND archived_at IS NULL
            );
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql).Bind("id", id);
        return await command.ExecuteNonQueryAsync(token) == 1;
    }
}
