using System.Security.Claims;
using Gstock.Contracts.Common;
using Microsoft.AspNetCore.Http;

namespace Gstock.backend.Shared.Identity;

public sealed class CurrentRequestIdentity : IRequestIdentity
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentRequestIdentity(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? EmployeeId => ReadGuidClaim("sub");

    public Guid? SessionId => ReadGuidClaim("sid");

    private Guid? ReadGuidClaim(string claimType)
    {
        var identity = _httpContextAccessor.HttpContext?.User.Identity
            as ClaimsIdentity;

        if (identity is null || !identity.IsAuthenticated)
        {
            return null;
        }

        var value = identity.FindFirst(claimType)?.Value;
        return Guid.TryParse(value, out var id) ? id : null;
    }
}