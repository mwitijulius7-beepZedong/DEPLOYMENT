Write-Host "Starting Node.js server..."
if (Test-Path ".\server.js") {
    Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Minimized
    Write-Host "Server process started."
    # Give the server a moment to initialize
    Start-Sleep -Seconds 2
} else {
    Write-Warning "server.js not found. Please ensure the server is running manually."
}

Write-Host "Opening Admin Portal..."
Start-Process "http://localhost:3000"

Write-Host "`n----------------------------------------"
Write-Host " LOGIN CREDENTIALS"
Write-Host "----------------------------------------"
Write-Host " * Auto-login enabled for localhost *"
Write-Host " 1. Entry Key: admin123"
Write-Host " 2. Username:  admin"
Write-Host " 3. Password:  password"
Write-Host "----------------------------------------"