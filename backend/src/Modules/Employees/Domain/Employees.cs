using Gstock.Api.Modules.Employees.Domain;
using Gstock.Api.Modules.Employees.Domain;
namespace Gstock.Api.Modules.Employees.Domain;

public class Employees
{
    public required Guid Id{get; init;}
    public required string EmployeeId{get; set;}
    public required string FullName{get; set;}
    public required string email{get; set;}
    public required AccountRoles AccountRole{get; init;}
    public required string Role{get; set;}
    public required AccountStatus Status{get; set;}
    public required DateTime CreatedAt{get; init;}
    public required DateTime UpdatedAt{get; set;}
}