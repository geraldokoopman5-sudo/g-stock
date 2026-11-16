namespace Gstock.Api.Modules.Authentication.Application;

internal sealed record AuthenticatedSession(Guid SessionId, Guid EmployeeId);

internal interface IAuthSessionRepository
{
    Task<AuthenticatedSession?> FindActiveAsync(
        Guid sessionId,
        Guid employeeId,
        CancellationToken cancellationToken);
}
