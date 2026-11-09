using Gstock.Contracts.Common;

namespace Gstock.ArchitectureTests;

public sealed class ModuleBoundaryTests
{
    [Fact]
    public void ContractsStayIndependentOfTheHostAndDatabaseProvider()
    {
        var references = typeof(IClock).Assembly.GetReferencedAssemblies();

        Assert.DoesNotContain(references, reference =>
            reference.Name is "Gstock.backend" or "Npgsql"
            || reference.Name?.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal) == true);
    }
}
