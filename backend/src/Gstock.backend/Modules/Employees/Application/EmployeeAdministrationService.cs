using System.Net.Mail;
using Gstock.Contracts.Common;
using Gstock.Contracts.Employees;
using Gstock.backend.Shared.Errors;
using Gstock.backend.Shared.Validation;

namespace Gstock.backend.Modules.Employees.Application;

internal sealed class EmployeeAdministrationService(
    IEmployeeRepository repository,
    IIdGenerator ids) : IEmployeeAdministration
{
    public async Task<Guid> CreateAsync(
        EmployeeProvisionRequest request, IUnitOfWork work, CancellationToken cancellationToken = default)
    {
        var employeeNumber = ValidateText(request.EmployeeNumber, 32, "employeeNumber");
        var fullName = ValidateText(request.FullName, 100, "fullName");
        var email = ValidateText(request.Email, 254, "email");
        var department = ValidateText(request.Department, 80, "department");
        var role = ValidateText(request.Role, 80, "role");
        if (!MailAddress.TryCreate(email, out var address) || address.Address != email)
        {
            throw new GstockApplicationException(ErrorCodes.ValidationFailed, "Enter a valid email address.", "email");
        }

        if (!Enum.IsDefined(request.AccountPermission))
        {
            throw new GstockApplicationException(
                ErrorCodes.ValidationFailed, "Choose a valid account permission.", "accountPermission");
        }

        var employee = new EmployeeSnapshot(
            ids.newId(), employeeNumber, fullName, email, department, role,
            request.AccountPermission, EmployeeAccountStatus.Active);

        await repository.InsertAsync(employee, work, cancellationToken);
        return employee.Id;
    }

    private static string ValidateText(string? value, int maxLength, string field)
    {
        var text = TextNormalization.Required(value, field);
        if (text.EnumerateRunes().Count() > maxLength || text.Contains('\0'))
        {
            throw new GstockApplicationException(
                ErrorCodes.ValidationFailed, $"Enter valid text of at most {maxLength} characters.", field);
        }

        return text;
    }
}
