#Requires -Version 7.2

param([switch]$StaffManager)

$ErrorActionPreference = 'Stop'
$gstockApi = Join-Path $PSScriptRoot '../src/Gstock.Api/Gstock.Api.csproj'

dotnet run --project $gstockApi --launch-profile http -- --migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$hasJwtSettings = dotnet user-secrets list --project $gstockApi |
    Select-String -Pattern '^Auth:(Issuer|SigningKeyId|PrivateKeyPem|SigningKeys:[^ ]+)\s+=' -Quiet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (!$hasJwtSettings) {
    $keyId = 'gstock-dev-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
    $rsa = [System.Security.Cryptography.RSA]::Create(2048)
    try {
        @{
            'Auth:Issuer' = 'gstock-dev'
            'Auth:SigningKeyId' = $keyId
            'Auth:PrivateKeyPem' = $rsa.ExportPkcs8PrivateKeyPem()
            "Auth:SigningKeys:$keyId" = $rsa.ExportSubjectPublicKeyInfoPem()
        } | ConvertTo-Json -Compress | dotnet user-secrets set --project $gstockApi
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    finally {
        $rsa.Dispose()
    }
}
else {
    Write-Host 'Using the JWT settings already in User Secrets.'
}

$provision = if ($StaffManager) { "--provision-dev-staff-manager" } else { "--provision-dev-stock-manager" }
dotnet run --project $gstockApi --no-build --launch-profile http -- $provision
exit $LASTEXITCODE
