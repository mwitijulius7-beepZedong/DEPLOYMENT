# Test script for new notifications and content settings APIs
# Run this after starting the server with: node server.js

Write-Host "Testing new settings APIs..." -ForegroundColor Green

$baseUrl = "http://localhost:3000"

# Test 1: GET /api/settings/notifications (should return defaults)
Write-Host "`n1. Testing GET /api/settings/notifications" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/notifications" -Method GET
    Write-Host "Success: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: GET /api/settings/content (should return defaults)
Write-Host "`n2. Testing GET /api/settings/content" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/content" -Method GET
    Write-Host "Success: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: POST /api/settings/notifications without auth (should fail)
Write-Host "`n3. Testing POST /api/settings/notifications without auth (should fail)" -ForegroundColor Yellow
try {
    $body = @{
        emailNotifications = $false
        commentNotifications = $false
        subscriptionNotifications = $false
        adminEmail = "test@example.com"
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/notifications" -Method POST -Body $body -ContentType "application/json"
    Write-Host "Unexpected success: $($response | ConvertTo-Json)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "Expected failure: Unauthorized access" -ForegroundColor Green
    } else {
        Write-Host "Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 4: POST /api/settings/content without auth (should fail)
Write-Host "`n4. Testing POST /api/settings/content without auth (should fail)" -ForegroundColor Yellow
try {
    $body = @{
        enableComments = $false
        enableSubscriptions = $false
        postsPerPage = 5
        featuredPostsCount = 2
        enableRichTextEditor = $false
    } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/content" -Method POST -Body $body -ContentType "application/json"
    Write-Host "Unexpected success: $($response | ConvertTo-Json)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "Expected failure: Unauthorized access" -ForegroundColor Green
    } else {
        Write-Host "Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 5: Login to get admin token
Write-Host "`n5. Logging in as admin to get token" -ForegroundColor Yellow
try {
    $loginBody = @{
        username = "admin"
        password = "Mwitijulius7@Jm"
    } | ConvertTo-Json
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.token
    Write-Host "Login successful, token obtained" -ForegroundColor Green
} catch {
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 6: POST /api/settings/notifications with auth
Write-Host "`n6. Testing POST /api/settings/notifications with auth" -ForegroundColor Yellow
try {
    $body = @{
        emailNotifications = $false
        commentNotifications = $true
        subscriptionNotifications = $true
        adminEmail = "admin@example.com"
    } | ConvertTo-Json
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/notifications" -Method POST -Headers $headers -Body $body
    Write-Host "Success: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Verify notifications settings were saved
Write-Host "`n7. Verifying notifications settings were saved" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/notifications" -Method GET
    if ($response.notifications.emailNotifications -eq $false -and
        $response.notifications.commentNotifications -eq $true -and
        $response.notifications.subscriptionNotifications -eq $true -and
        $response.notifications.adminEmail -eq "admin@example.com") {
        Write-Host "Success: Settings saved correctly" -ForegroundColor Green
    } else {
        Write-Host "Error: Settings not saved correctly. Response: $($response | ConvertTo-Json)" -ForegroundColor Red
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 8: POST /api/settings/content with auth
Write-Host "`n8. Testing POST /api/settings/content with auth" -ForegroundColor Yellow
try {
    $body = @{
        enableComments = $false
        enableSubscriptions = $true
        postsPerPage = 15
        featuredPostsCount = 5
        enableRichTextEditor = $true
    } | ConvertTo-Json
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/content" -Method POST -Headers $headers -Body $body
    Write-Host "Success: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 9: Verify content settings were saved
Write-Host "`n9. Verifying content settings were saved" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/content" -Method GET
    if ($response.content.enableComments -eq $false -and
        $response.content.enableSubscriptions -eq $true -and
        $response.content.postsPerPage -eq 15 -and
        $response.content.featuredPostsCount -eq 5 -and
        $response.content.enableRichTextEditor -eq $true) {
        Write-Host "Success: Settings saved correctly" -ForegroundColor Green
    } else {
        Write-Host "Error: Settings not saved correctly. Response: $($response | ConvertTo-Json)" -ForegroundColor Red
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 10: POST /api/settings/notifications with invalid payload
Write-Host "`n10. Testing POST /api/settings/notifications with invalid payload" -ForegroundColor Yellow
try {
    $body = "invalid json"
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/notifications" -Method POST -Headers $headers -Body $body
    Write-Host "Unexpected success: $($response | ConvertTo-Json)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "Expected failure: Invalid payload" -ForegroundColor Green
    } else {
        Write-Host "Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 11: POST /api/settings/content with invalid payload
Write-Host "`n11. Testing POST /api/settings/content with invalid payload" -ForegroundColor Yellow
try {
    $body = @{
        postsPerPage = "not a number"
        featuredPostsCount = -1
    } | ConvertTo-Json
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/content" -Method POST -Headers $headers -Body $body
    Write-Host "Unexpected success: $($response | ConvertTo-Json)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "Expected failure: Invalid payload" -ForegroundColor Green
    } else {
        Write-Host "Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 12: Test edge cases - boundary values for content settings
Write-Host "`n12. Testing edge cases for content settings" -ForegroundColor Yellow
try {
    $body = @{
        postsPerPage = 1  # minimum
        featuredPostsCount = 0  # minimum
    } | ConvertTo-Json
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/content" -Method POST -Headers $headers -Body $body
    Write-Host "Success: Boundary values accepted: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 13: Test maximum values
Write-Host "`n13. Testing maximum values for content settings" -ForegroundColor Yellow
try {
    $body = @{
        postsPerPage = 50  # maximum
        featuredPostsCount = 10  # maximum
    } | ConvertTo-Json
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/api/settings/content" -Method POST -Headers $headers -Body $body
    Write-Host "Success: Maximum values accepted: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTesting completed!" -ForegroundColor Green
