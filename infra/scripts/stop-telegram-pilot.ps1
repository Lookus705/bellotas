$ErrorActionPreference = "Stop"

$root = "C:\Users\lucas\OneDrive\Escritorio\codex\bellotas"
$toolsDir = Join-Path $root "infra\tools"
$pidPath = Join-Path $toolsDir "localtunnel-pilot.pid"
$envPath = Join-Path $root ".env"

if (Test-Path $pidPath) {
  $pidValue = Get-Content $pidPath -ErrorAction SilentlyContinue
  if ($pidValue) {
    try {
      Stop-Process -Id ([int]$pidValue) -Force -ErrorAction Stop
    } catch {
    }
  }
  Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
}

if (Test-Path $envPath) {
  $envContent = Get-Content $envPath
  $tokenLine = $envContent | Where-Object { $_ -match "^TELEGRAM_BOT_TOKEN=" } | Select-Object -First 1
  if ($tokenLine) {
    $token = $tokenLine.Substring("TELEGRAM_BOT_TOKEN=".Length).Trim()
    if ($token) {
      Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/deleteWebhook" -Method Post | Out-Null
    }
  }
}

Write-Output "Telegram piloto detenido y webhook eliminado."
