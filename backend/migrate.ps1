[CmdletBinding()]
param(
    [string]$Database,
    [string]$Username = 'postgres',
    [string]$DatabaseHost = 'localhost',
    [ValidateRange(1, 65535)]
    [int]$Port = 5432
)

$ErrorActionPreference = 'Stop'
$previousConnectionString = $env:Database__MigrationConnectionString
$migrationSecret = $null
$settings = $null
$migrationExitCode = 1

try {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        throw 'The .NET SDK is required. Install it before running migrations.'
    }

    if ([string]::IsNullOrWhiteSpace($Database)) {
        $Database = Read-Host 'Existing PostgreSQL database name'
    }
    if ([string]::IsNullOrWhiteSpace($Database)) {
        throw 'Enter the name of an existing PostgreSQL database.'
    }

    Write-Host "Connecting to $Database on ${DatabaseHost}:$Port as $Username."
    $migrationSecret = Read-Host 'PostgreSQL password' -AsSecureString

    # Quote passwords and other values correctly, including semicolons and quotes.
    $settings = New-Object System.Data.Common.DbConnectionStringBuilder
    $settings['Host'] = $DatabaseHost
    $settings['Port'] = $Port
    $settings['Database'] = $Database
    $settings['Username'] = $Username
    $settings['Password'] = [System.Net.NetworkCredential]::new('', $migrationSecret).Password
    $env:Database__MigrationConnectionString = $settings.ConnectionString

    $project = Join-Path $PSScriptRoot 'src\Gstock.backend'
    & dotnet run --project $project --no-launch-profile -- --migrate
    $migrationExitCode = $LASTEXITCODE
    if ($migrationExitCode -ne 0) {
        Write-Host 'Migration failed. Check that the database exists and the PostgreSQL login details are correct.'
    }
}
catch {
    Write-Host $_.Exception.Message
}
finally {
    $env:Database__MigrationConnectionString = $previousConnectionString
    if ($null -ne $settings) { $settings.Clear() }
    if ($null -ne $migrationSecret) { $migrationSecret.Dispose() }
}

exit $migrationExitCode
