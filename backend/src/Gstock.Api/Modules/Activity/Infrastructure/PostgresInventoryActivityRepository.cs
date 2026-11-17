using System.Data.Common;
using Gstock.Api.Modules.Activity.Application;
using Gstock.Api.Shared.Database;
using Npgsql;
using NpgsqlTypes;

namespace Gstock.Api.Modules.Activity.Infrastructure;

internal sealed class PostgresInventoryActivityRepository(NpgsqlDataSource source) : IInventoryActivityRepository
{
    public Task AddWarehouseCreatedAsync(WarehouseCreatedActivity activity, DbTransaction transaction, CancellationToken token) =>
        InsertAsync(activity.Id, "warehouse-created", activity.WarehouseId, null, null, activity.WarehouseName,
            activity.ActorId, activity.ActorEmployeeId, activity.ActorFullName, null, null, null, null, transaction, token);

    public Task AddAsync(InventoryEvent activity, DbTransaction transaction, CancellationToken token) =>
        InsertAsync(Guid.NewGuid(), activity.Type, activity.WarehouseId, activity.BrandId, activity.ItemId, activity.Name,
            activity.Actor.Id, activity.Actor.EmployeeNumber, activity.Actor.FullName,
            activity.PreviousQuantity, activity.Quantity, activity.Unit, activity.Reason, transaction, token);

    private static async Task InsertAsync(
        Guid id, string type, Guid warehouseId, Guid? brandId, Guid? itemId, string name, Guid actorId,
        string employeeId, string fullName, int? previous, int? quantity, string? unit, string? reason,
        DbTransaction transaction, CancellationToken token)
    {
        const string sql = """
            INSERT INTO public.inventory_activity
                (id, type, warehouse_id, brand_id, item_id, entity_name, actor_id,
                 actor_employee_id, actor_full_name, previous_quantity, quantity, unit, reason)
            VALUES (@id, @type, @warehouse, @brand, @item, @name, @actor,
                    @employee, @full_name, @previous, @quantity, @unit, @reason);
            """;
        await using var command = PostgresCommand.InTransaction(transaction, sql)
            .Bind("id", id).Bind("type", type).Bind("warehouse", warehouseId)
            .Bind("name", name).Bind("actor", actorId).Bind("employee", employeeId).Bind("full_name", fullName)
            .BindNullable("brand", NpgsqlDbType.Uuid, brandId).BindNullable("item", NpgsqlDbType.Uuid, itemId)
            .BindNullable("previous", NpgsqlDbType.Integer, previous).BindNullable("quantity", NpgsqlDbType.Integer, quantity)
            .BindNullable("unit", NpgsqlDbType.Text, unit).BindNullable("reason", NpgsqlDbType.Text, reason);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task<IReadOnlyList<ActivityEntry>> ListAsync(ActivityFilter filter, CancellationToken token)
    {
        const string sql = """
            SELECT id, type, warehouse_id, brand_id, item_id, entity_name, actor_id, actor_employee_id,
                   actor_full_name, occurred_at, previous_quantity, quantity, unit, reason
            FROM public.inventory_activity
            WHERE (@warehouse IS NULL OR warehouse_id = @warehouse)
              AND (@brand IS NULL OR brand_id = @brand)
              AND (@item IS NULL OR item_id = @item)
              AND (@type IS NULL OR type = @type)
              AND (@from_time IS NULL OR occurred_at >= @from_time)
              AND (@to_time IS NULL OR occurred_at <= @to_time)
            ORDER BY occurred_at DESC, id DESC LIMIT @limit OFFSET @offset;
            """;
        await using var command = source.CreateCommand(sql)
            .BindNullable("warehouse", NpgsqlDbType.Uuid, filter.WarehouseId)
            .BindNullable("brand", NpgsqlDbType.Uuid, filter.BrandId)
            .BindNullable("item", NpgsqlDbType.Uuid, filter.ItemId)
            .BindNullable("type", NpgsqlDbType.Text, filter.Type)
            .BindNullable("from_time", NpgsqlDbType.TimestampTz, filter.From?.UtcDateTime)
            .BindNullable("to_time", NpgsqlDbType.TimestampTz, filter.To?.UtcDateTime)
            .Bind("limit", filter.Limit).Bind("offset", filter.Offset);
        await using var reader = await command.ExecuteReaderAsync(token);
        var entries = new List<ActivityEntry>();
        while (await reader.ReadAsync(token))
        {
            entries.Add(new ActivityEntry(
                reader.GetGuid(0), reader.GetString(1), reader.GetGuid(2), reader.NullableValue<Guid>(3),
                reader.NullableValue<Guid>(4), reader.GetString(5),
                new ActivityActor(reader.GetGuid(6), reader.GetString(7), reader.GetString(8)),
                reader.GetDateTime(9), reader.NullableValue<int>(10), reader.NullableValue<int>(11),
                reader.NullableText(12), reader.NullableText(13)));
        }

        return entries;
    }
}
