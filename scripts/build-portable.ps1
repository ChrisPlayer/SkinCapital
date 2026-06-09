# Builds the SkinCapital portable pack for Windows (zip with embedded Node).
# Usage: npm run package:win   (or: powershell -File scripts/build-portable.ps1)
# Output: release/SkinCapital-portable-win64-v<version>.zip
param(
  # Portable Node runtime to embed (must match engines: Node 22 x64).
  [string]$NodeDir = "C:\Users\Skoll\Desktop\claude\node-v22.22.3-win-x64"
)
$ErrorActionPreference = 'Stop'

$repo = Split-Path $PSScriptRoot -Parent
$pkg = Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
$stage = Join-Path $env:TEMP 'skincapital-pack'
$packName = "SkinCapital"
$packRoot = Join-Path $stage $packName

if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) {
  throw "node.exe introuvable dans $NodeDir (parametre -NodeDir)"
}
$env:Path = "$NodeDir;" + $env:Path

Write-Host "[1/6] Build du client (vite)..."
Push-Location $repo
npm run build | Out-Null
if ($LASTEXITCODE -ne 0) { throw "vite build a echoue" }
Pop-Location

Write-Host "[2/6] Export du code (git archive HEAD)..."
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $packRoot 'app') -Force | Out-Null
$tmpZip = Join-Path $env:TEMP 'skincapital-src.zip'
Push-Location $repo
git archive --format=zip -o $tmpZip HEAD
Pop-Location
Expand-Archive -Path $tmpZip -DestinationPath (Join-Path $packRoot 'app') -Force
Remove-Item $tmpZip

Write-Host "[3/6] Copie du client builde + dependances de prod (npm)..."
Copy-Item (Join-Path $repo 'dist') (Join-Path $packRoot 'app\dist') -Recurse -Force
Push-Location (Join-Path $packRoot 'app')
npm install --omit=dev --no-audit --no-fund | Out-Null
if ($LASTEXITCODE -ne 0) { throw "npm install a echoue" }
Pop-Location

Write-Host "[4/6] Lanceur, .env et runtime Node..."
$portable = Join-Path $repo 'scripts\portable'
Copy-Item (Join-Path $portable 'launcher.cjs') (Join-Path $packRoot 'app\launcher.cjs')
Copy-Item (Join-Path $portable 'env.template') (Join-Path $packRoot 'app\.env')
Copy-Item (Join-Path $portable 'SkinCapital.vbs') (Join-Path $packRoot 'SkinCapital.vbs')
Copy-Item (Join-Path $portable 'Arreter-SkinCapital.cmd') (Join-Path $packRoot 'Arreter-SkinCapital.cmd')
Copy-Item (Join-Path $portable 'LISEZMOI.txt') (Join-Path $packRoot 'LISEZMOI.txt')
New-Item -ItemType Directory -Path (Join-Path $packRoot 'node') -Force | Out-Null
Copy-Item (Join-Path $NodeDir 'node.exe') (Join-Path $packRoot 'node\node.exe')

Write-Host "[5/6] Nettoyage (fichiers inutiles au runtime)..."
$app = Join-Path $packRoot 'app'
@('scripts', '.github', 'drizzle', 'vitest.config.ts', 'eslint.config.js', '.env.example',
  '.gitignore', '.nvmrc', 'README.md') | ForEach-Object {
  $p = Join-Path $app $_
  if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}
# Tests are not shipped
Get-ChildItem $app -Recurse -Filter '*.test.ts' -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "[6/6] Zip final..."
$releaseDir = Join-Path $repo 'release'
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
$zipPath = Join-Path $releaseDir "SkinCapital-portable-win64-v$version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $packRoot -DestinationPath $zipPath -CompressionLevel Optimal

$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host ""
Write-Host "OK -> $zipPath ($size MB)"
Write-Host "A distribuer tel quel : dezipper puis double-cliquer sur SkinCapital."
