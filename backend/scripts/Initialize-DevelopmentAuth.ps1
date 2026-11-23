#Requires -Version 7.2

param([switch]$StaffManager)

$ErrorActionPreference = 'Stop'
$gstockApi = Join-Path $PSScriptRoot '../src/Gstock.Api/Gstock.Api.csproj'
$environmentPath = Join-Path $PSScriptRoot '../src/Gstock.Api/.env.local'

dotnet run --project $gstockApi --launch-profile http -- --migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$jwtEntries = @(Get-Content -LiteralPath $environmentPath |
    Select-String -Pattern '^\s*Auth__(Issuer|SigningKeyId|PrivateKeyPem|SigningKeys__[^\s=]+)\s*=')
if ($jwtEntries.Count -gt 0 -and $jwtEntries.Count -lt 4) {
    throw 'The backend .env.local has incomplete JWT settings. Configure issuer, signing key ID, private key and matching public key.'
}

if ($jwtEntries.Count -eq 0) {
    $keyId = 'gstock-dev-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
    $rsa = [System.Security.Cryptography.RSA]::Create(2048)
    try {
        $settings = [ordered]@{
            'Auth__Issuer' = 'gstock-dev'
            'Auth__SigningKeyId' = $keyId
            'Auth__PrivateKeyPem' = $rsa.ExportPkcs8PrivateKeyPem()
            "Auth__SigningKeys__$keyId" = $rsa.ExportSubjectPublicKeyInfoPem()
        }
        $lines = @('') + @($settings.GetEnumerator() | ForEach-Object {
            $_.Key + '=' + (ConvertTo-Json -InputObject $_.Value -Compress)
        })
        Add-Content -LiteralPath $environmentPath -Value $lines -Encoding utf8
    }
    finally {
        $rsa.Dispose()
    }
}
else {
    Write-Host 'Using the JWT settings already in the backend .env.local.'
}

$provision = if ($StaffManager) { "--provision-dev-staff-manager" } else { "--provision-dev-stock-manager" }
dotnet run --project $gstockApi --no-build --launch-profile http -- $provision
exit $LASTEXITCODE
