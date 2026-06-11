# Builds the SkinCapital Windows package: a console SkinCapital.exe (Node SEA)
# plus the server bundle and its runtime dependencies.
# Usage: npm run package:win
# Output: release/SkinCapital-win-x64-v<version>.zip
$ErrorActionPreference = 'Stop'

$repo = Split-Path $PSScriptRoot -Parent
$pkg = Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version

$nodeVersion = (& node --version)
if ($nodeVersion -notmatch '^v22\.') {
  throw "Node 22 required for packaging (found: $nodeVersion) - the SEA embeds THIS node.exe"
}

$stage = Join-Path $repo 'release\.stage-win'
$packRoot = Join-Path $stage 'SkinCapital'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $packRoot 'app') -Force | Out-Null

Write-Host '[1/5] Build (vite client + esbuild server bundle)...'
Push-Location $repo
try {
  npm run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
} finally { Pop-Location }
Copy-Item (Join-Path $repo 'dist\server\server.cjs') (Join-Path $packRoot 'app\server.cjs')
Copy-Item (Join-Path $repo 'dist\client') (Join-Path $packRoot 'app\public') -Recurse

Write-Host '[2/5] Runtime dependencies (better-sqlite3 + Steam stack)...'
node (Join-Path $repo 'scripts\gen-runtime-package.mjs') (Join-Path $packRoot 'app')
Push-Location (Join-Path $packRoot 'app')
try {
  npm install --omit=dev --no-audit --no-fund --no-bin-links | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'npm install (runtime) failed' }
  Remove-Item package.json, package-lock.json -ErrorAction SilentlyContinue
} finally { Pop-Location }

Write-Host '[3/5] SkinCapital.exe (Node SEA)...'
$seaConfig = Join-Path $stage 'sea-config.json'
$seaBlob = Join-Path $stage 'sea-prep.blob'
$seaJson = @{
  main = (Join-Path $repo 'scripts\win\bootstrap.cjs')
  output = $seaBlob
  disableExperimentalSEAWarning = $true
} | ConvertTo-Json
# WriteAllText: BOM-free UTF-8 even under Windows PowerShell 5.1 (CI), where
# Set-Content -Encoding utf8 would emit a BOM that breaks the SEA config parser.
[IO.File]::WriteAllText($seaConfig, $seaJson)
node --experimental-sea-config $seaConfig
if ($LASTEXITCODE -ne 0) { throw 'SEA blob generation failed' }
$exePath = Join-Path $packRoot 'SkinCapital.exe'
Copy-Item (Get-Command node).Source $exePath
npx postject $exePath NODE_SEA_BLOB $seaBlob `
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if ($LASTEXITCODE -ne 0) { throw 'postject failed' }

Write-Host '[4/5] README...'
Copy-Item (Join-Path $repo 'scripts\win\README.txt') (Join-Path $packRoot 'README.txt')

Write-Host '[5/5] Final zip...'
$releaseDir = Join-Path $repo 'release'
$zipPath = Join-Path $releaseDir "SkinCapital-win-x64-v$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $packRoot -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force

$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host ''
Write-Host "OK -> $zipPath ($size MB)"
