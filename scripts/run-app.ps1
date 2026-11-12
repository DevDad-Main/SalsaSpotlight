# SalsaSpotlight dev-loop helper (GFN/SalsaNOW).
# Stops the installed copy + any stale dev electron, then launches `electron .` from source.
# Usage:  pwsh -NoProfile -File scripts\run-app.ps1   (output also written to scripts\run-app.txt)
$ErrorActionPreference = 'Stop'
$log = @()

# 1) Stop every running SalsaSpotlight process (installed copy holds Alt+Space + single-instance lock)
$procs = Get-Process -Name 'SalsaSpotlight' -ErrorAction SilentlyContinue
if ($procs) {
  $procs | ForEach-Object { $_.Id } | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 1500
}
$left = @(Get-Process -Name 'SalsaSpotlight' -ErrorAction SilentlyContinue).Count
$log += "STOPPED_INSTALLED: remaining=$left"

# Also clear any stale electron from a previous dev run in this repo
$stale = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*SalsaSpotlight-main*' }
if ($stale) { $stale | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 1000; $log += 'CLEARED_STALE_DEV' }

# 2) Launch the dev build from source (minimized console so it stays alive after this script exits)
$bat = Join-Path $PSScriptRoot 'launch-dev.bat'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $bat -WindowStyle Minimized
$log += 'LAUNCHED_DEV: electron from source (minimized console)'

# 3) Verify it came up
$ok = $false
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Milliseconds 1500
  $dev = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*SalsaSpotlight-main*' }
  if ($dev) { $ok = $true; break }
}
if ($ok) {
  $main = $dev | Select-Object -First 1
  $log += "DEV_RUNNING: pid=$($main.ProcessId)"
} else {
  $log += 'DEV_RUNNING: NOT DETECTED (check the minimized console window)'
}

Set-Content -Path (Join-Path $PSScriptRoot 'run-app.txt') -Value ($log -join "`n")
Write-Output ($log -join "`n")
