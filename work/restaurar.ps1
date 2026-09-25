#requires -Version 5.1
<#[.SYNOPSIS]
  Comprueba un .vbk en una base NUEVA y temporal del PostgreSQL 16 local
  (puerto 55432), corre migraciones + smoke y deja la base eliminada.
  Nunca restaura sobre la base indicada en DATABASE_URL.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Archivo,
  [string]$PgBin
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'Falta DATABASE_URL en el entorno.' }
if ([string]::IsNullOrWhiteSpace($env:BACKUP_ENCRYPTION_PASSPHRASE) -or $env:BACKUP_ENCRYPTION_PASSPHRASE.Length -lt 20) {
  throw 'Falta BACKUP_ENCRYPTION_PASSPHRASE (mínimo 20 caracteres) en el entorno.'
}
try { $uri = [Uri]$env:DATABASE_URL } catch { throw 'DATABASE_URL debe ser una URL PostgreSQL válida.' }
if ($uri.Scheme -notin @('postgres', 'postgresql') -or
    $uri.Host -notin @('127.0.0.1', 'localhost', '::1') -or $uri.Port -ne 55432 -or
    -not [string]::IsNullOrEmpty($uri.Query)) {
  throw 'La restauración sólo acepta PostgreSQL local en 127.0.0.1:55432.'
}
if (-not [string]::IsNullOrWhiteSpace($PgBin)) { $env:PG_BIN = $PgBin }
if ([string]::IsNullOrWhiteSpace($env:PG_BIN)) { throw 'Define PG_BIN con el directorio de clientes PostgreSQL 16.' }
foreach ($tool in @('pg_dump', 'pg_restore', 'psql')) {
  $binary = Join-Path $env:PG_BIN ($tool + '.exe')
  if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw "Falta $tool en PG_BIN." }
  $version = & $binary --version 2>$null
  if ($LASTEXITCODE -ne 0 -or $version -notmatch 'PostgreSQL\) 16(?:\.|\s|$)') { throw "$tool no es un cliente PostgreSQL 16 ejecutable." }
}
$archive = [IO.Path]::GetFullPath($Archivo)
if ([IO.Path]::GetExtension($archive) -ne '.vbk' -or -not (Test-Path -LiteralPath $archive -PathType Leaf)) {
  throw 'Indica un paquete .vbk existente.'
}
$checksum = $archive + '.sha256'
if (-not (Test-Path -LiteralPath $checksum -PathType Leaf)) { throw 'Falta el SHA-256 del paquete cifrado.' }
$expected = ([IO.File]::ReadAllText($checksum) -split '\s+')[0].ToLowerInvariant()
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expected -notmatch '^[a-f0-9]{64}$' -or $expected -ne $actual) { throw 'SHA-256 del paquete cifrado no coincide.' }
$node = (Get-Command node -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
Push-Location $repo
try {
  & $npm run build --workspace=valle-design-api
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar la API para el smoke local.' }
} finally { Pop-Location }

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporary = Join-Path $tempRoot ('valle-restore-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
  $receiptJson = & $node (Join-Path $repo 'scripts\ops\backup-envelope.mjs') unpack $archive $temporary 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'El paquete cifrado no se pudo autenticar o descifrar.' }
  $receipt = $receiptJson | ConvertFrom-Json
  & $node (Join-Path $repo 'scripts\ops\restore-verify.mjs') --dump $receipt.dump --local-checks
  if ($LASTEXITCODE -ne 0) { throw 'Restauración temporal, inventario, migraciones o smoke no superaron la verificación.' }
  Write-Host "Ejercicio local validado. Paquete SHA-256: $actual"
} finally {
  $resolved = [IO.Path]::GetFullPath($temporary)
  $rootPrefix = $tempRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if ($resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolved).StartsWith('valle-restore-', [StringComparison]::Ordinal)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
  } else {
    throw 'Ruta temporal de restauración fuera del directorio previsto; no se elimina.'
  }
}
