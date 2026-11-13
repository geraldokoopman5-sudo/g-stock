using Gstock.Api.Modules.Warehouses.Application;
using Gstock.Api.Modules.Warehouses.Domain;
using Npgsql;

namespace Gstock.Api.Modules.Warehouses.Infrastructure;

internal sealed class PostgresWarehouseRepository(NpgsqlDataSource dataSource)
    : IWarehouseRepository
{
    public async Task<IReadOnlyList<Warehouse>> ListAsync(CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT id, name, street_name, suburb_name, city, province, postal_code
            FROM public.warehouses
            ORDER BY name, id;
            """;

        await using var command = dataSource.CreateCommand(sql);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var warehouses = new List<Warehouse>();

        while (await reader.ReadAsync(cancellationToken))
        {
            warehouses.Add(new Warehouse
            {
                Id = reader.GetGuid(0),
                Name = reader.GetString(1),
                StreetName = reader.GetString(2),
                SuburbName = reader.GetString(3),
                City = reader.GetString(4),
                Province = reader.GetString(5),
                PostalCode = reader.GetInt32(6)
            });
        }

        return warehouses;
    }
}
