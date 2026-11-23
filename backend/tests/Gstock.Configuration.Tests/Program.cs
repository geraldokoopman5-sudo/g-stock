using System.Security.Cryptography;
using System.Text.Json;
using Gstock.Api.Shared.Configuration;
using Microsoft.Extensions.Configuration.Memory;

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

if (args is ["--local", var localPath])
{
    var local = DevelopmentEnvironmentFile.Read(Path.GetFullPath(localPath));
    Check(!string.IsNullOrWhiteSpace(local.GetValueOrDefault("ConnectionStrings:DefaultConnection")),
        "Local database connection is missing.");
    var keyId = local["Auth:SigningKeyId"];
    using var privateKey = RSA.Create();
    using var publicKey = RSA.Create();
    privateKey.ImportFromPem(local["Auth:PrivateKeyPem"]!);
    publicKey.ImportFromPem(local[$"Auth:SigningKeys:{keyId}"]!);
    var message = "local configuration validation"u8.ToArray();
    var signature = privateKey.SignData(message, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    Check(publicKey.VerifyData(message, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1),
        "Local JWT keys do not match.");
    Console.WriteLine("PASS: local database setting is present and JWT signing keys match (values hidden).");
    return;
}

var scratch = Path.Combine(Path.GetTempPath(), "gstock-env-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(scratch);
var path = Path.Combine(scratch, ".env.local");
const string variable = "GstockLocalEnvTest__Value";
var previous = Environment.GetEnvironmentVariable(variable);
try
{
    var pem = "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n";
    var connection = "Host=localhost;Password=space # hash $cash ${literal} \\ slash \"quote\";";
    File.WriteAllLines(path,
    [
        "# comment", "", "Auth__PrivateKeyPem=" + JsonSerializer.Serialize(pem),
        "ConnectionStrings__DefaultConnection=" + JsonSerializer.Serialize(connection),
        "Auth__SigningKeys__dev-key='literal\\n$unchanged#value'",
        "Unquoted=abc=def#hash", "Comment=value # comment", "Empty=", "GstockLocalEnvTest__Value=local"
    ]);
    var values = DevelopmentEnvironmentFile.Read(path);
    Check(values["Auth:PrivateKeyPem"] == pem, "Multiline PEM did not round-trip.");
    Check(values["ConnectionStrings:DefaultConnection"] == connection, "Password characters changed.");
    Check(values["Auth:SigningKeys:dev-key"] == "literal\\n$unchanged#value", "Literal quotes were expanded.");
    Check(values["Unquoted"] == "abc=def#hash" && values["Comment"] == "value" && values["Empty"] == "",
        "Unquoted values or comments were parsed incorrectly.");

    foreach (var invalid in new[] { "missing-separator", " =value", "1INVALID=value", "Key=\"secret\\q\"", "Key='unclosed", "Key=one\nKEY=two" })
    {
        var invalidPath = Path.Combine(scratch, "invalid.env");
        File.WriteAllText(invalidPath, invalid);
        try
        {
            DevelopmentEnvironmentFile.Read(invalidPath);
            throw new Exception("Invalid entry was accepted.");
        }
        catch (InvalidOperationException error)
        {
            Check(error.InnerException is null && !error.ToString().Contains("secret"),
                "A parsing error exposed a value.");
        }
    }
    Console.WriteLine("PASS: PEM/password escaping, comments, literal values, duplicate rejection and safe errors.");

    void Verify(string environment, string? expected, string[]? options = null, bool defaults = false)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ContentRootPath = scratch, EnvironmentName = environment, Args = options ?? []
        });
        try
        {
            if (defaults) builder.Configuration.Sources.Insert(0, new MemoryConfigurationSource
            {
                InitialData = new Dictionary<string, string?> { ["GstockLocalEnvTest:Value"] = "appsettings-default" }
            });
            builder.AddDevelopmentEnvironmentFile();
            Check(builder.Configuration["GstockLocalEnvTest:Value"] == expected,
                "Configuration precedence or environment isolation failed.");
        }
        finally { ((IDisposable)builder.Configuration).Dispose(); }
    }

    Environment.SetEnvironmentVariable(variable, null);
    Verify("Development", "local", defaults: true);
    Environment.SetEnvironmentVariable(variable, "environment");
    Verify("Development", "environment");
    Verify("Development", "command-line", ["--GstockLocalEnvTest:Value=command-line"]);
    Environment.SetEnvironmentVariable(variable, null);
    Verify("Production", null);
    File.WriteAllText(path, "malformed secret content");
    Verify("Production", null);
    File.Delete(path);
    Verify("Development", null);
    Console.WriteLine("PASS: local settings override defaults; environment/CLI win; Production ignores local files; missing files are optional.");
}
finally
{
    Environment.SetEnvironmentVariable(variable, previous);
    Check(Path.GetDirectoryName(Path.GetFullPath(scratch)) == Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar)
        && Path.GetFileName(scratch).StartsWith("gstock-env-tests-"), "Unexpected temporary test directory.");
    Directory.Delete(scratch, recursive: true);
}
