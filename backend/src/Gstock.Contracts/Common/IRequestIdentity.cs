namespace Gstock.Contracts.Common;

public interface IRequestIdentity
{
    Guid? EmployeeId {get;}
    Guid? SessionId {get;}
}