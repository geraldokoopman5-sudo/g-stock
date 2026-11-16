#Requires -Version 7.2

param([string]$BaseUri = 'http://localhost:5268')

$ErrorActionPreference = 'Stop'
$target = [uri]$BaseUri
if (!$target.IsAbsoluteUri -or !$target.IsLoopback -or
    $target.Scheme -notin @('http', 'https') -or $target.UserInfo -or
    $target.AbsolutePath -ne '/' -or $target.Query -or $target.Fragment) {
    throw 'Use the root URL of a local development API.'
}

$api = $target.GetLeftPart([UriPartial]::Authority).TrimEnd('/') + '/api/v1'
$email = Read-Host 'Development Stock Manager email'
$secret = Read-Host 'Password' -AsSecureString
$login = [pscredential]::new($email, $secret)
try {
    $body = @{
        email = $email
        password = $login.GetNetworkCredential().Password
    } | ConvertTo-Json -Compress
    $signIn = Invoke-RestMethod -Method Post -Uri "$api/auth/login" -ContentType 'application/json' -Body $body
}
finally {
    Remove-Variable -Name body,login,secret -ErrorAction SilentlyContinue
}

$headers = @{ Authorization = 'Bearer ' + $signIn.accessToken }
try {
    $marker = [guid]::NewGuid().ToString('N')
    $body = @{
        name = "Smoke test $marker"
        streetName = "1 Smoke Test Road $marker"
        suburbName = 'Test'
        city = 'Cape Town'
        province = 'Western Cape'
        postalCode = 8001
    } | ConvertTo-Json -Compress
    $warehouse = Invoke-RestMethod -Method Post -Uri "$api/warehouses" -Headers $headers -ContentType 'application/json' -Body $body -StatusCodeVariable warehouseStatus

    if ($warehouseStatus -ne 201 -or !$warehouse.id) { throw 'Warehouse creation did not return 201 and an ID.' }

    $detail = Invoke-RestMethod -Uri "$api/warehouses/$($warehouse.id)" -Headers $headers
    $events = Invoke-RestMethod -Uri "$api/inventory/activity?warehouseId=$($warehouse.id)&type=warehouse-created" -Headers $headers
    if ($detail.id -ne $warehouse.id -or !($events | Where-Object {
        $_.warehouseId -eq $warehouse.id -and $_.type -eq 'warehouse-created' -and $_.entityName -eq $warehouse.name
    })) {
        throw 'The created warehouse or its matching activity entry was missing.'
    }
    Write-Host "Warehouse creation and activity verified for $($warehouse.id)."
}
finally {
    try {
        Invoke-RestMethod -Method Post -Uri "$api/auth/logout" -Headers $headers | Out-Null
    }
    finally {
        Remove-Variable -Name headers,signIn -ErrorAction SilentlyContinue
    }
}
