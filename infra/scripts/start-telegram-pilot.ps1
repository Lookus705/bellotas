$ErrorActionPreference = "Stop"

$root = "C:\Users\lucas\OneDrive\Escritorio\codex\bellotas"
$toolsDir = Join-Path $root "infra\tools"
$logPath = Join-Path $toolsDir "localtunnel-pilot.log"
$pidPath = Join-Path $toolsDir "localtunnel-pilot.pid"
$envPath = Join-Path $root ".env"
$tenantSlug = "demo-logistica"
$localApiUrl = "http://localhost:4000"

if (-not (Test-Path $envPath)) {
  throw "No se encontro .env en $envPath"
}

$envContent = Get-Content $envPath
$tokenLine = $envContent | Where-Object { $_ -match "^TELEGRAM_BOT_TOKEN=" } | Select-Object -First 1
if (-not $tokenLine) {
  throw "TELEGRAM_BOT_TOKEN no esta definido en .env"
}

$token = $tokenLine.Substring("TELEGRAM_BOT_TOKEN=".Length).Trim()
if (-not $token) {
  throw "TELEGRAM_BOT_TOKEN esta vacio en .env"
}

Push-Location $root
try {
  docker compose up -d
} finally {
  Pop-Location
}

try {
  Invoke-RestMethod -Uri "$localApiUrl/api/health" -TimeoutSec 15 | Out-Null
} catch {
  throw "La API local no responde en $localApiUrl/api/health"
}

if (Test-Path $pidPath) {
  $oldPid = Get-Content $pidPath -ErrorAction SilentlyContinue
  if ($oldPid) {
    try {
      Stop-Process -Id ([int]$oldPid) -Force -ErrorAction Stop
    } catch {
    }
  }
  Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
}

if (Test-Path $logPath) {
  Remove-Item $logPath -Force
}

$process = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList "-NoProfile", "-Command", "npx --yes localtunnel --port 4000 *> '$logPath'" `
  -PassThru `
  -WindowStyle Hidden

Set-Content -Path $pidPath -Value $process.Id

$publicUrl = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (-not (Test-Path $logPath)) {
    continue
  }

  $line = Get-Content $logPath | Select-String -Pattern "https://.*loca.lt" | Select-Object -Last 1
  if ($line) {
    $publicUrl = $line.Matches[0].Value.Trim()
    break
  }
}

if (-not $publicUrl) {
  throw "No se pudo obtener la URL publica de localtunnel desde $logPath"
}

$webhookUrl = "$publicUrl/api/telegram/webhook/$tenantSlug"
$setWebhook = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ url = $webhookUrl }
Start-Sleep -Seconds 2
$webhookInfo = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo"

[pscustomobject]@{
  tunnelPid = $process.Id
  publicUrl = $publicUrl
  webhookUrl = $webhookUrl
  setWebhookOk = $setWebhook.ok
  telegramWebhook = $webhookInfo.result.url
} | Format-List
