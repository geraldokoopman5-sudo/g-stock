using System.Data.Common;
using Gstock.Api.Modules.Activity.Application;
using Npgsql;

namespace Gstock.Api.Modules.Activity.Infrastructure;

internal sealed class PostgresInventoryActivityRepository : IInventoryActivityRepository
{
    public async Task AddWarehouseCreatedAsync(
        WarehouseCreatedActivity activity,
        DbTransaction transaction,
        CancellationToken cancellationToken)
    {
        if (transaction is not NpgsqlTransaction { Connection: { } connection } postgresTransaction)
        {
            throw new InvalidOperationException("An active PostgreSQL transaction is required.");
        }

        const string sql = """
            INSERT INTO public.inventory_activity (
                id, type, warehouse_id, entity_name,
                actor_id, actor_employee_id, actor_full_name
            )
            VALUES (@id, 'warehouse-created', @warehouse_id, @entity_name,
                    @actor_id, @actor_employee_id, @actor_full_name);
            """;

        await using var command = new NpgsqlCommand(sql, connection, postgresTransaction);
        command.Parameters.AddWithValue("id", activity.Id);
        command.Parameters.AddWithValue("warehouse_id", activity.WarehouseId);
        command.Parameters.AddWithValue("entity_name", activity.WarehouseName);
        command.Parameters.AddWithValue("actor_id", activity.ActorId);
        command.Parameters.AddWithValue("actor_employee_id", activity.ActorEmployeeId);
        command.Parameters.AddWithValue("actor_full_name", activity.ActorFullName);

        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
