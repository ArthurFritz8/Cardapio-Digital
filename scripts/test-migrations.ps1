param([string]$PostgreSqlBin = 'C:\Program Files\PostgreSQL\16\bin')
$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$auditRoot = Join-Path $tempRoot ('cardapio-audit-' + [guid]::NewGuid().ToString('N'))
$auditData = Join-Path $auditRoot 'data'
$auditDb = 'cardapio_audit_tests'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$auditPort = $listener.LocalEndpoint.Port
$listener.Stop()
$started = $false
function Invoke-Pg([string]$Command, [string[]]$Arguments) {
  & (Join-Path $PostgreSqlBin ($Command + '.exe')) @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command falhou (exit $LASTEXITCODE)" }
}
try {
  New-Item -ItemType Directory -Path $auditRoot | Out-Null
  Invoke-Pg 'initdb' @('-D', $auditData, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C')
  Add-Content -LiteralPath (Join-Path $auditData 'postgresql.conf') -Value "`nlisten_addresses = '127.0.0.1'`nport = $auditPort`nwal_level = logical"
  Invoke-Pg 'pg_ctl' @('-D', $auditData, '-l', (Join-Path $auditRoot 'postgres.log'), '-w', 'start')
  $started = $true
  $connection = @('-h', '127.0.0.1', '-p', "$auditPort", '-U', 'postgres')
  Invoke-Pg 'createdb' ($connection + @($auditDb))
  $sqlConnection = $connection + @('-X', '-v', 'ON_ERROR_STOP=1', '-d', $auditDb)
  Invoke-Pg 'psql' ($sqlConnection + @('-f', (Join-Path $PSScriptRoot 'bootstrap-test-db.sql')))
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase/migrations') -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    Write-Host "Aplicando $($_.Name)"
    Invoke-Pg 'psql' ($sqlConnection + @('-f', $_.FullName))
  }
  Invoke-Pg 'psql' ($sqlConnection + @('-f', (Join-Path $PSScriptRoot 'verify-migrations.sql')))
  Invoke-Pg 'psql' ($sqlConnection + @('-f', (Join-Path $repoRoot 'supabase/tests/audit-regression.sql')))
  & node (Join-Path $PSScriptRoot 'test-concurrency.mjs') $PostgreSqlBin "$auditPort" $auditDb
  if ($LASTEXITCODE -ne 0) { throw 'Testes de seed/concorrência falharam.' }
  Write-Host 'SQL aprovado em PostgreSQL descartável. Smoke Supabase/PostgREST/Realtime real ainda obrigatório.'
} finally {
  if ($started) { Invoke-Pg 'pg_ctl' @('-D', $auditData, '-m', 'fast', '-w', 'stop') }
  # Verifica o caminho absoluto antes de remoção recursiva; um único shell.
  $resolvedAudit = [System.IO.Path]::GetFullPath($auditRoot)
  if (-not $resolvedAudit.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      [System.IO.Path]::GetFileName($resolvedAudit) -notlike 'cardapio-audit-*') {
    throw 'Caminho temporário inesperado; remoção recusada.'
  }
  if (Test-Path -LiteralPath $resolvedAudit) { Remove-Item -LiteralPath $resolvedAudit -Recurse -Force }
}
