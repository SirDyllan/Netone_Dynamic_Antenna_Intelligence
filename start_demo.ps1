Write-Host "=============================================="
Write-Host " NETONE DYNAMIC ANTENNA INTELLIGENCE"
Write-Host "=============================================="

py -m pip install -r requirements.txt

Start-Process powershell -ArgumentList `
    "-NoExit", `
    "-Command", `
    "cd '$PWD'; py backend/server.py"

$backendReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:5001/api/health" -TimeoutSec 1
        if ($health.ok) {
            $backendReady = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $backendReady) {
    Write-Error "Backend did not become ready at http://127.0.0.1:5001. Check the backend window for errors."
    exit 1
}

Start-Process powershell -ArgumentList `
    "-NoExit", `
    "-Command", `
    "cd '$PWD'; py -m http.server 8000 --directory frontend"

Start-Process "http://127.0.0.1:8000"

Write-Host ""
Write-Host "Backend:  http://127.0.0.1:5001"
Write-Host "Frontend: http://127.0.0.1:8000"
Write-Host ""
Write-Host "Demo started."
