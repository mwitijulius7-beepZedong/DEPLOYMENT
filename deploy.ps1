Write-Host "Preparing deployment..."
param(
    [string]$Message = "Update production configuration and fixes"
)

# Sync the text file to the actual HTML file served by Express
Write-Host "Starting deployment process..." -ForegroundColor Cyan

# 1. Migration: Sync the development text file to the production HTML file
if (Test-Path ".\index.html.txt") {
    Write-Host "Syncing index.html.txt to index.html..."
    Write-Host "Migrating index.html.txt to index.html..." -ForegroundColor Yellow
    Copy-Item ".\index.html.txt" -Destination ".\index.html" -Force
}

Write-Host "Staging files..."
# 2. Build/Prep: Ensure uploads directory exists (basic build check)
if (-not (Test-Path ".\uploads")) {
    New-Item -ItemType Directory -Force -Path ".\uploads" | Out-Null
}

# 3. Git Operations
Write-Host "Staging changes..." -ForegroundColor Yellow
git add .

Write-Host "Committing changes..."
git commit -m "$Message"

Write-Host "Pushing to production..."
Write-Host "Pushing to remote repository..." -ForegroundColor Yellow
git push

Write-Host "Done! If connected to Vercel/Netlify, deployment should start automatically."
Write-Host "Deployment complete!" -ForegroundColor Green