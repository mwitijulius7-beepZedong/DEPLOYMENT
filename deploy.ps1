Write-Host "Preparing deployment..."

# Sync the text file to the actual HTML file served by Express
if (Test-Path ".\index.html.txt") {
    Write-Host "Syncing index.html.txt to index.html..."
    Copy-Item ".\index.html.txt" -Destination ".\index.html" -Force
}

Write-Host "Staging files..."
git add .

Write-Host "Committing changes..."
git commit -m "Fix production credentials: Update admin key and login defaults"

Write-Host "Pushing to production..."
git push

Write-Host "Done! If connected to Vercel/Netlify, deployment should start automatically."