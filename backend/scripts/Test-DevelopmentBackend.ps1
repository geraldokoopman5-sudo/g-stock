#Requires -Version 7.2

param([uri]$BaseUri = 'https://localhost:7181')

$ErrorActionPreference = 'Stop'
if (!$BaseUri.IsAbsoluteUri -or !$BaseUri.IsLoopback -or $BaseUri.Scheme -ne 'https' -or
    $BaseUri.UserInfo -or $BaseUri.AbsolutePath -ne '/' -or $BaseUri.Query -or $BaseUri.Fragment) {
    throw 'Use the root HTTPS URL of a local development API.'
}

$api = $BaseUri.GetLeftPart([UriPartial]::Authority) + '/api/v1'

function Invoke-SmokeRequest {
    param(
        [string]$Method, [string]$Path, [int]$ExpectedStatus, [string]$Token,
        [hashtable]$Body, [Microsoft.PowerShell.Commands.WebRequestSession]$Session, [string]$Csrf
    )

    $request = @{
        Method = $Method
        Uri = "$api$Path"
        SkipCertificateCheck = $true
        MaximumRedirection = 0
        TimeoutSec = 30
        SkipHttpErrorCheck = $true
        StatusCodeVariable = 'status'
        Headers = @{}
    }
    if ($Token) { $request.Headers.Authorization = "Bearer $Token" }
    if ($Csrf) { $request.Headers['X-CSRF-Token'] = $Csrf }
    if ($Session) { $request.WebSession = $Session }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Compress
    }

    $result = Invoke-RestMethod @request
    if ($status -ne $ExpectedStatus) {
        throw "$Method $Path returned $status. Expected $ExpectedStatus."
    }
    return $result
}

function Connect-SmokeManager([string]$Role) {
    $email = Read-Host "Development $Role email"
    $password = Read-Host 'Password' -AsSecureString
    $credential = [pscredential]::new($email, $password)
    $login = Invoke-SmokeRequest Post '/auth/login' 200 -Body @{
        email = $email
        password = $credential.GetNetworkCredential().Password
    }
    $profile = Invoke-SmokeRequest Get '/auth/me' 200 $login.accessToken
    $canCreateWarehouse = $Role -eq 'StockManager'
    if ($profile.profile.accountRole -cne $Role -or $profile.permissions.canCreateWarehouse -ne $canCreateWarehouse) {
        throw "Expected an active $Role with the correct warehouse creation permission."
    }
    return $login.accessToken
}

$stock = Connect-SmokeManager 'StockManager'
$staff = Connect-SmokeManager 'StaffManager'
$marker = [guid]::NewGuid().ToString('N')
$employeeLogin = @{ email = "smoke-$marker@example.test"; password = [guid]::NewGuid().ToString('N') }
$employeeInput = @{
    employeeId = "SM-$($marker.Substring(0, 20))"
    fullName = "Smoke Employee $marker"
    email = $employeeLogin.email
    accountRole = 'Nemployee'
    password = $employeeLogin.password
}
$null = Invoke-SmokeRequest Post '/employees' 403 $stock -Body $employeeInput
$employee = Invoke-SmokeRequest Post '/employees' 201 $staff -Body $employeeInput
$employeePath = "/employees/$($employee.id)"
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$clerk = (Invoke-SmokeRequest Post '/auth/login' 200 -Body $employeeLogin -Session $session).accessToken
$null = Invoke-SmokeRequest Get '/warehouses' 401

$warehouseInput = @{
    name = "Smoke Warehouse $marker"
    streetName = "1 Smoke Test Road $marker"
    suburbName = 'Test'
    city = 'Cape Town'
    province = 'Western Cape'
    postalCode = 8001
}
$invalidAddress = $warehouseInput.Clone()
$invalidAddress.Remove('postalCode')
$null = Invoke-SmokeRequest Post '/warehouses' 422 $stock -Body $invalidAddress
$null = Invoke-SmokeRequest Post '/warehouses' 403 $staff -Body $warehouseInput
$warehouse = Invoke-SmokeRequest Post '/warehouses' 201 $stock -Body $warehouseInput
$warehousePath = "/warehouses/$($warehouse.id)"
$warehouseInput.name = "Smoke Warehouse B $marker"
$warehouseInput.streetName = "  1   SMOKE TEST ROAD $marker  "
$null = Invoke-SmokeRequest Post '/warehouses' 409 $stock -Body $warehouseInput
$warehouseInput.streetName = "2 Smoke Test Road $marker"
$otherWarehouse = Invoke-SmokeRequest Post '/warehouses' 201 $stock -Body $warehouseInput
$warehouseInput.name = "Smoke Warehouse C $marker"
$warehouseInput.streetName = "3 Smoke Test Road $marker"
$null = Invoke-SmokeRequest Post '/warehouses' 201 $clerk -Body $warehouseInput
$detail = Invoke-SmokeRequest Get $warehousePath 200 $clerk
$events = @(Invoke-SmokeRequest Get "/inventory/activity?warehouseId=$($warehouse.id)&type=warehouse-created" 200 $clerk)
if ($detail.id -ne $warehouse.id -or $events.Count -ne 1 -or $events[0].entityName -ne $warehouse.name) {
    throw 'The warehouse detail or its matching activity entry was missing.'
}

$brandInput = @{ warehouseId = $warehouse.id; name = "Smoke Brand $marker" }
$null = Invoke-SmokeRequest Post '/brands' 403 $clerk -Body $brandInput
$brand = Invoke-SmokeRequest Post '/brands' 201 $stock -Body $brandInput
$brandPath = "/brands/$($brand.id)"
$null = Invoke-SmokeRequest Post '/brands' 409 $stock -Body $brandInput
$brandInput.warehouseId = $otherWarehouse.id
$otherBrand = Invoke-SmokeRequest Post '/brands' 201 $stock -Body $brandInput
if ($brand.id -eq $otherBrand.id) { throw 'The brands must have separate IDs.' }

$generatedSkus = [System.Collections.Generic.HashSet[string]]::new()
foreach ($skuValue in @($null, '', '   ')) {
    $generatedInput = @{ brandId = $brand.id; name = "Generated SKU Item $marker"; quantity = 2; unit = 'units' }
    if ($null -ne $skuValue) { $generatedInput.sku = $skuValue }
    $generatedItem = Invoke-SmokeRequest Post '/items' 201 $clerk -Body $generatedInput
    if ($generatedItem.sku -cnotmatch '^GST-[0-9A-F]{32}$' -or !$generatedSkus.Add($generatedItem.sku)) {
        throw 'Items without a SKU must receive distinct generated SKUs.'
    }
    $found = @(Invoke-SmokeRequest Get "/items?query=$($generatedItem.sku)" 200 $clerk)
    if ($found.Count -ne 1 -or $found[0].id -ne $generatedItem.id) {
        throw 'The generated SKU could not be searched after saving.'
    }
    $generatedPath = "/items/$($generatedItem.id)"
    $updatedItem = Invoke-SmokeRequest Post "$generatedPath/adjustments" 200 $clerk -Body @{
        mode = 'add'; quantity = 1; expectedQuantity = 2; reason = 'Generated SKU smoke test'
    }
    if ($updatedItem.sku -cne $generatedItem.sku) { throw 'A quantity change replaced the generated SKU.' }
    $null = Invoke-SmokeRequest Delete $generatedPath 204 $clerk
}

$itemInput = @{ brandId = $brand.id; name = "Smoke Item $marker"; sku = "SMOKE $marker"; quantity = 5; unit = 'units' }
$wrongWarehouse = $itemInput.Clone()
$wrongWarehouse.warehouseId = $otherWarehouse.id
$null = Invoke-SmokeRequest Post '/items' 422 $clerk -Body $wrongWarehouse
$null = Invoke-SmokeRequest Post '/items' 403 $stock -Body $itemInput
$item = Invoke-SmokeRequest Post '/items' 201 $clerk -Body $itemInput
$itemPath = "/items/$($item.id)"
$itemInput.brandId = $otherBrand.id
$itemInput.sku = "  smoke   $marker  "
$null = Invoke-SmokeRequest Post '/items' 409 $clerk -Body $itemInput
$null = Invoke-SmokeRequest Delete $brandPath 409 $stock

$adjustment = @{ mode = 'remove'; quantity = 6; expectedQuantity = 5; reason = 'Smoke test stock count' }
$null = Invoke-SmokeRequest Post "$itemPath/adjustments" 422 $clerk -Body $adjustment
$adjustment.quantity = 5
$adjustment.expectedQuantity = 4
$null = Invoke-SmokeRequest Post "$itemPath/adjustments" 409 $clerk -Body $adjustment
$adjustment.expectedQuantity = 5
$adjusted = Invoke-SmokeRequest Post "$itemPath/adjustments" 200 $clerk -Body $adjustment
$activity = @(Invoke-SmokeRequest Get "/inventory/activity?itemId=$($item.id)&type=quantity-updated" 200 $clerk)
if ($null -eq $adjusted.quantity -or $adjusted.quantity -ne 0 -or $activity.Count -ne 1 -or
    $activity[0].previousQuantity -ne 5 -or $null -eq $activity[0].quantity -or
    $activity[0].quantity -ne 0 -or $activity[0].reason -cne $adjustment.reason) {
    throw 'The stock adjustment or its matching activity entry was incorrect.'
}

$null = Invoke-SmokeRequest Delete $itemPath 204 $clerk
$null = Invoke-SmokeRequest Get $itemPath 404 $clerk
$null = Invoke-SmokeRequest Delete $brandPath 204 $stock
$null = Invoke-SmokeRequest Get $brandPath 404 $clerk
$itemInput.sku = "SMOKE $marker"
$null = Invoke-SmokeRequest Post '/items' 409 $clerk -Body $itemInput
$null = Invoke-SmokeRequest Delete "/brands/$($otherBrand.id)" 204 $stock
Write-Host 'Warehouse, catalogue, stock adjustments, archiving and activity verified.'

$refreshUri = [uri]"$api/auth/refresh"
$originalCookie = $session.Cookies.GetCookies($refreshUri)['gstock_refresh']
if (!$originalCookie) { throw 'The sign-in response did not set a refresh cookie.' }
$replaySession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$replayCookie = [System.Net.Cookie]::new($originalCookie.Name, $originalCookie.Value, $originalCookie.Path)
$replayCookie.Secure = $true
$replaySession.Cookies.Add($refreshUri, $replayCookie)
$csrf = (Invoke-SmokeRequest Get '/auth/csrf' 200 -Session $session).csrfToken
$null = Invoke-SmokeRequest Post '/auth/refresh' 403 -Session $session
$clerk = (Invoke-SmokeRequest Post '/auth/refresh' 200 -Session $session -Csrf $csrf).accessToken
$null = Invoke-SmokeRequest Get '/auth/me' 200 $clerk
$null = Invoke-SmokeRequest Post '/auth/refresh' 401 -Session $replaySession -Csrf $csrf
$null = Invoke-SmokeRequest Get '/auth/me' 401 $clerk
$clerk = (Invoke-SmokeRequest Post '/auth/login' 200 -Body $employeeLogin).accessToken

$null = Invoke-SmokeRequest Patch $employeePath 403 $stock -Body @{ fullName = 'Should not change' }
$null = Invoke-SmokeRequest Patch $employeePath 200 $staff -Body @{ fullName = 'Updated smoke employee'; status = 'InActive' }
$null = Invoke-SmokeRequest Get '/auth/me' 401 $clerk
$null = Invoke-SmokeRequest Post '/auth/login' 401 -Body $employeeLogin
$edits = @(Invoke-SmokeRequest Get "$employeePath/edits" 200 $staff)
if (!($edits.changes | Where-Object { $_.field -eq 'full_name' -and $_.after -eq 'Updated smoke employee' })) {
    throw 'The employee name change was missing from edit history.'
}
$null = Invoke-SmokeRequest Patch $employeePath 200 $staff -Body @{ status = 'Active' }
$clerk = (Invoke-SmokeRequest Post '/auth/login' 200 -Body $employeeLogin).accessToken
$null = Invoke-SmokeRequest Post '/auth/logout' 204 $clerk
$null = Invoke-SmokeRequest Get '/auth/me' 401 $clerk
$null = Invoke-SmokeRequest Patch $employeePath 200 $staff -Body @{ status = 'InActive' }
$null = Invoke-SmokeRequest Post '/auth/logout' 204 $stock
$null = Invoke-SmokeRequest Post '/auth/logout' 204 $staff
Write-Host 'Employee permissions, edit history, session refresh, token reuse protection and logout verified.'
