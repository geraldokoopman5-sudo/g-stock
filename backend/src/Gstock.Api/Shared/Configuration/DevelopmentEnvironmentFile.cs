using System.Text.Json;
using Microsoft.Extensions.Configuration.EnvironmentVariables;
using Microsoft.Extensions.Configuration.Memory;

namespace Gstock.Api.Shared.Configuration;

internal static class DevelopmentEnvironmentFile
{
    public static void AddDevelopmentEnvironmentFile(this WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsDevelopment()) return;

        var path = Path.Combine(builder.Environment.ContentRootPath, ".env.local");
        if (!File.Exists(path)) return;

        var values = Read(path);
        // Local values override appsettings/user secrets, while real environment
        // variables and command-line arguments keep their normal higher priority.
        var sources = builder.Configuration.Sources;
        var position = sources.ToList().FindIndex(source =>
            source is EnvironmentVariablesConfigurationSource { Prefix: null or "" });
        sources.Insert(position < 0 ? sources.Count : position,
            new MemoryConfigurationSource { InitialData = values });
    }

    internal static Dictionary<string, string?> Read(string path)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var lineNumber = 0;
        foreach (var raw in File.ReadLines(path))
        {
            lineNumber++;
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;

            var separator = line.IndexOf('=');
            if (separator < 1) throw InvalidLine(lineNumber);
            var name = line[..separator].Trim();
            if (name.Length == 0 || !(char.IsAsciiLetter(name[0]) || name[0] == '_') ||
                name.Any(character => !(char.IsAsciiLetterOrDigit(character) || character is '_' or '-')))
                throw InvalidLine(lineNumber);

            var value = line[(separator + 1)..].Trim();
            if (value.StartsWith('"'))
            {
                try
                {
                    // JSON escaping keeps multiline PEM keys on one line and
                    // preserves quotes, backslashes, dollar signs and hashes.
                    value = JsonSerializer.Deserialize<string>(value) ?? throw InvalidLine(lineNumber);
                }
                catch (JsonException)
                {
                    // Do not attach parsing exceptions: they may reveal a secret.
                    throw InvalidLine(lineNumber);
                }
            }
            else if (value.StartsWith('\''))
            {
                if (value.Length < 2 || !value.EndsWith('\'')) throw InvalidLine(lineNumber);
                value = value[1..^1];
            }
            else
            {
                var comment = value.IndexOf('#');
                if (comment >= 0 && (comment == 0 || char.IsWhiteSpace(value[comment - 1])))
                    value = value[..comment].TrimEnd();
            }

            if (!values.TryAdd(name.Replace("__", ":", StringComparison.Ordinal), value))
                throw InvalidLine(lineNumber);
        }
        return values;
    }

    private static InvalidOperationException InvalidLine(int lineNumber) =>
        new($"Invalid .env.local entry on line {lineNumber}. Use unique NAME=value entries; double-quoted values use JSON escaping.");
}
