param(
    [string] $Base = 'http://localhost:3000',
    [string] $Username = 'admin',
    [string] $Password = 'password',
    [string] $ImagePath = "$env:TEMP\smoke-test.png",
    [string] $CategoryName = 'Smoke Test',
    [switch] $StartServer,
    [switch] $StopServer,
    [int] $StartTimeout = 30
)

$ErrorActionPreference = 'Stop'

<#
  Non-interactive smoke-test for CI.
  Usage examples:
    # run end-to-end, don't start server, default creds
    .\smoke-test.ps1

    # run and start server for up to 45s, custom image
    .\smoke-test.ps1 -StartServer -StartTimeout 45 -ImagePath 'C:\artifacts\img.png'

  Parameters:
    -Base: Base URL of the server (default http://localhost:3000)
    -Username/-Password: admin credentials
    -ImagePath: local image to upload
    -CategoryName: name for created category
    -StartServer: start node server.js from the repo root
    -StopServer: stop the started node process at the end
    -StartTimeout: seconds to wait for server to become ready
#>

function Upload-FileMultipart {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)] [string] $Url,
        [Parameter(Mandatory=$true)] [string] $FilePath,
        [Parameter(Mandatory=$false)] [hashtable] $Fields = @{},
        [Parameter(Mandatory=$false)] [hashtable] $Headers = @{}
    )

    if (-not (Test-Path $FilePath)) { throw "File not found: $FilePath" }

    $fileName = [System.IO.Path]::GetFileName($FilePath)
    $contentType = switch -regex ($fileName) {
        '\.png$'  { 'image/png' ; break }
        '\.jpg$'  { 'image/jpeg'; break }
        '\.jpeg$' { 'image/jpeg'; break }
        '\.webp$' { 'image/webp' ; break }
        default   { 'application/octet-stream' }
    }

    $boundary = '----PSFormBoundary' + [Guid]::NewGuid().ToString("N")
    $newline = "`r`n"
    $enc = [System.Text.Encoding]::UTF8

    $sb = New-Object System.Text.StringBuilder
    foreach ($key in $Fields.Keys) {
        $sb.Append("--$boundary$newline") | Out-Null
        $sb.Append("Content-Disposition: form-data; name=`"$key`"$newline$newline") | Out-Null
        $sb.Append([System.Uri]::EscapeDataString([string]$Fields[$key]) + $newline) | Out-Null
    }
    $prefixBytes = $enc.GetBytes($sb.ToString())

    $fileHeader = "--$boundary$newline"
    $fileHeader += "Content-Disposition: form-data; name=`"image`"; filename=`"$fileName`"$newline"
    $fileHeader += "Content-Type: $contentType$newline$newline"
    $fileHeaderBytes = $enc.GetBytes($fileHeader)

    $footer = $newline + "--$boundary--" + $newline
    $footerBytes = $enc.GetBytes($footer)

    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method = "POST"
    $req.AllowAutoRedirect = $true
    $req.ContentType = "multipart/form-data; boundary=$boundary"
    $req.KeepAlive = $false
    $req.Timeout = 120000

    foreach ($h in $Headers.GetEnumerator()) {
        if ($h.Key -eq 'Cookie') { $req.Headers.Add('Cookie', $h.Value) } else { $req.Headers.Add($h.Key, $h.Value) }
    }

    $fileInfo = Get-Item $FilePath
    try { $req.ContentLength = $prefixBytes.Length + $fileHeaderBytes.Length + $fileInfo.Length + $footerBytes.Length } catch { }

    $reqStream = $req.GetRequestStream()
    $reqStream.Write($prefixBytes, 0, $prefixBytes.Length)
    $reqStream.Write($fileHeaderBytes, 0, $fileHeaderBytes.Length)

    $fileStream = [System.IO.File]::OpenRead($FilePath)
    try {
        $buffer = New-Object byte[] (16KB)
        while (($read = $fileStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $reqStream.Write($buffer, 0, $read)
        }
    } finally { $fileStream.Close() }

    $reqStream.Write($footerBytes, 0, $footerBytes.Length)
    $reqStream.Close()

    try {
        $resp = $req.GetResponse()
        $stream = $resp.GetResponseStream()
        $sr = New-Object System.IO.StreamReader($stream)
        $body = $sr.ReadToEnd()
        $sr.Close()
        $resp.Close()
        return $body
    } catch [System.Net.WebException] {
        $we = $_.Exception
        if ($we.Response -ne $null) {
            $respStream = $we.Response.GetResponseStream()
            $rdr = New-Object System.IO.StreamReader($respStream)
            $err = $rdr.ReadToEnd()
            $rdr.Close()
            throw "Server returned error: $($we.Message)`n$err"
        } else { throw $we }
    }
}

function Test-ServerAlive {
    param([string]$Url)
    try {
        $u = Build-Url $Url 'auth/status'
        Invoke-RestMethod -Uri $u -Method Get -TimeoutSec 5 -ErrorAction Stop | Out-Null
        return $true
    } catch { return $false }
}

function Build-Url {
    param(
        [Parameter(Mandatory=$true)][string] $BaseUrl,
        [Parameter(Mandatory=$true)][string] $Path
    )
    # ensure no duplicate slashes when building URLs
    $b = $BaseUrl.TrimEnd('/')
    $p = $Path.TrimStart('/')
    return "$b/$p"
}

$proc = $null
if ($StartServer) {
    if (-not (Test-Path .\server.js)) { Write-Error "server.js not found in current directory"; exit 2 }
    Write-Host "Starting node server (background)..."
    $proc = Start-Process -FilePath 'node' -ArgumentList '.\server.js' -WorkingDirectory (Get-Location) -PassThru -WindowStyle Hidden
    $wait = 0
    while ($wait -lt $StartTimeout) {
        if (Test-ServerAlive -Url $Base) { break }
        Start-Sleep -Seconds 1
        $wait++
    }
    if (-not (Test-ServerAlive -Url $Base)) { Write-Error "Server did not become ready after $StartTimeout seconds"; exit 3 }
}

if (-not (Test-ServerAlive -Url $Base)) { Write-Error "Server not responding at $Base"; exit 4 }

# Create session to keep cookies
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Host "Logging in as $Username..."
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
$login = Invoke-RestMethod -Uri (Build-Url $Base 'auth/login') -Method Post -Body $loginBody -ContentType 'application/json' -WebSession $session -ErrorAction Stop
Write-Host "Login response:`n"; $login | ConvertTo-Json -Depth 4 | Write-Host

Write-Host "Checking auth status..."
$status = Invoke-RestMethod -Uri (Build-Url $Base 'auth/status') -Method Get -WebSession $session -ErrorAction Stop
Write-Host "Auth status:`n"; $status | ConvertTo-Json -Depth 4 | Write-Host

Write-Host "Creating category '$CategoryName'..."
$cat = Invoke-RestMethod -Uri (Build-Url $Base 'api/categories') -Method Post -Body (@{ name = $CategoryName } | ConvertTo-Json) -ContentType 'application/json' -WebSession $session -ErrorAction Stop
Write-Host "Created category:`n"; $cat | ConvertTo-Json -Depth 4 | Write-Host

if (-not (Test-Path $ImagePath)) { Write-Error "Image file not found: $ImagePath"; exit 5 }

# Build cookie header from session
$cookieHeader = ($session.Cookies.GetCookies($Base) | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; '

Write-Host "Uploading image $ImagePath..."
try {
    $uploadBody = Upload-FileMultipart -Url (Build-Url $Base 'api/upload') -FilePath $ImagePath -Fields @{} -Headers @{ Cookie = $cookieHeader }
    $uploadJson = $uploadBody | ConvertFrom-Json
    Write-Host "Upload response:`n"; $uploadJson | ConvertTo-Json -Depth 6 | Write-Host
} catch {
    Write-Host "Upload failed (expected if Cloudinary not configured): $($_.Exception.Message)"
    $uploadJson = @{ url = "http://example.com/placeholder.png"; filename = "placeholder.png" }
}

Write-Host "Creating post referencing uploaded image..."
$slug = 'smoke-test-' + (Get-Random)
$postObj = @{
    title = 'Smoke test post'
    slug = $slug
    content = 'Post created by non-interactive smoke-test script'
    image = $uploadJson.url
    categoryId = $cat.id
    featured = $false
}
$created = Invoke-RestMethod -Uri (Build-Url $Base 'api/posts') -Method Post -Body ($postObj | ConvertTo-Json) -ContentType 'application/json' -WebSession $session -ErrorAction Stop
Write-Host "Created post:`n"; $created | ConvertTo-Json -Depth 6 | Write-Host

Write-Host "Listing posts..."
$posts = Invoke-RestMethod -Uri (Build-Url $Base 'api/posts') -Method Get -ErrorAction Stop
Write-Host "Posts:`n"; $posts | ConvertTo-Json -Depth 6 | Write-Host

if ($StopServer -and $proc -ne $null) {
    try { Stop-Process -Id $proc.Id -Force; Write-Host "Stopped node (PID=$($proc.Id))" } catch { Write-Warning "Failed to stop started node process: $($_.Exception.Message)" }
}

Write-Host "Smoke test finished successfully."
