namespace Gstock.Api.Modules.Warehouses.Domain;

public class Warehouse
{
    public required Guid Id{get; init;}
    public required string Name{get;init;}
    public required string StreetName{get; init;}
    public required string SuburbName{get; init;}
    public required string City{get; init;}
    public required string Province{get; init;}
    public required int PostalCode{get; init;}
}