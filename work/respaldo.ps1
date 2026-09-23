#requires -Version 5.1
<#[.SYNOPSIS]
  Respaldo cifrado portable de ValleCAD. DATABASE_URL y
  BACKUP_ENCRYPTION_PASSPHRASE vienen del entorno, jamás de argumentos.
  PG_BIN debe apuntar a los clientes PostgreSQL 16.
#>
[CmdletBinding()]
param(
  [string]$OutDir,
  [string]$PgBin
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path $repo 'backups' }
$destination = [IO.Path]::GetFullPath($OutDir)
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'Falta DATABASE_URL en el entorno.' }
if ([string]::IsNullOrWhiteSpace($env:BACKUP_ENCRYPTION_PASSPHRASE) -or $env:BACKUP_ENCRYPTION_PASSPHRASE.Length -lt 20) {
  throw 'Falta BACKUP_ENCRYPTION_PASSPHRASE (mínimo 20 caracteres) en el entorno.'
}
if (-not [string]::IsNullOrWhiteSpace($PgBin)) { $env:PG_BIN = $PgBin }
if ([string]::IsNullOrWhiteSpace($env:PG_BIN)) { throw 'Define PG_BIN con el directorio de clientes PostgreSQL 16.' }
foreach ($tool in @('pg_dump', 'pg_restore', 'psql')) {
  $binary = Join-Path $env:PG_BIN ($tool + '.exe')
  if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw "Falta $tool en PG_BIN." }
  $version = & $binary --version 2>$null
  if ($LASTEXITCODE -ne 0 -or $version -notmatch 'PostgreSQL\) 16(?:\.|\s|$)') { throw "$tool no es un cliente PostgreSQL 16 ejecutable." }
}
$node = (Get-Command node -ErrorAction Stop).Source
$name = 'valle-design-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$archive = Join-Path $destination ($name + '.vbk')
if (Test-Path -LiteralPath $archive) { throw 'Ya existe un respaldo con este sello; no se sobrescribe.' }
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporary = Join-Path $tempRoot ('valle-backup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $destination -Force | Out-Null
New-Item -ItemType Directory -Path $temporary | Out-Null
$archiveCreated = $false
try {
  & $node (Join-Path $repo 'scripts\ops\backup.mjs') --out $temporary --name $name
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump o el inventario falló; no existe backup válido.' }
  $receiptJson = & $node (Join-Path $repo 'scripts\ops\backup-envelope.mjs') pack $temporary $name $archive 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo cifrar el respaldo; la salida parcial fue eliminada.' }
  $archiveCreated = $true
  $receipt = $receiptJson | ConvertFrom-Json
  $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $receipt.sha256) { throw 'Falló la comprobación SHA-256 del paquete cifrado.' }
  $line = $hash + '  ' + [IO.Path]::GetFileName($archive) + "`n"
  [IO.File]::WriteAllText(($archive + '.sha256'), $line, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Respaldo cifrado creado: $archive"
  Write-Host "SHA-256 cifrado: $hash"
  Write-Host "Tamaño cifrado: $($receipt.bytes) bytes"
  Write-Host 'Aún no está validado: ejecútalo con work/restaurar.ps1 en PostgreSQL 16 local.'
} catch {
  if ($archiveCreated) {
    Remove-Item -LiteralPath ($archive + '.sha256') -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $archive -Force -ErrorAction Stop
  }
  throw
} finally {
  $resolved = [IO.Path]::GetFullPath($temporary)
  $rootPrefix = $tempRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if ($resolved.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolved).StartsWith('valle-backup-', [StringComparison]::Ordinal)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
  } else {
    throw 'Ruta temporal de respaldo fuera del directorio previsto; no se elimina.'
  }
}
