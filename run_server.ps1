$root = $PSScriptRoot
if (-not $root) { $root = Get-Location | Select-Object -ExpandProperty Path }

$python = Join-Path $root ".venv\Scripts\python.exe"
$frontend = Join-Path $root "frontend"

if (-not (Test-Path $python)) {
    Write-Host "ERROR: .venv not found. Run: py -3.12 -m venv .venv"
    Write-Host "Then: .venv\Scripts\pip install -r requirements-api.txt"
    exit 1
}

Write-Host "Loading data..."
& $python (Join-Path $root "scripts\load_synthetic_to_pipeline.py")
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "Starting API (serves app on port 8000)..."
Start-Process -FilePath $python -ArgumentList (Join-Path $root "run_api.py") -WorkingDirectory $root -WindowStyle Normal
Start-Sleep -Seconds 5

$listening = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-Host ""
    Write-Host "Server is running."
    Write-Host "Open in your browser:  http://localhost:8000"
    Write-Host ""
    Start-Process "http://localhost:8000"
} else {
    Write-Host "Server may still be starting. Open http://localhost:8000 in your browser."
}
