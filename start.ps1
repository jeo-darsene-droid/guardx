# Guard-X Dashboard — Démarrage Windows
# Usage : .\start.ps1  (depuis la racine du projet)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host ""
Write-Host "🔥 Guard-X Dashboard — démarrage..." -ForegroundColor Cyan
Write-Host ""

# ── Vérifications ──
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python introuvable. Installez Python 3.10+ : https://www.python.org/downloads/" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm introuvable. Installez Node.js 18+ : https://nodejs.org/" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "$root\.env") -and -not (Test-Path "$root\backend\.env")) {
    Write-Host "⚠️  Fichier .env introuvable (racine ou backend/)." -ForegroundColor Yellow
    Write-Host "   Créez-le avec SUPABASE_URL et SUPABASE_SERVICE_KEY (voir README.md)." -ForegroundColor Yellow
    Write-Host ""
}

# ── Dépendances backend ──
Write-Host "📦 Vérification des dépendances Python..." -ForegroundColor Gray
python -m pip install -q -r "$root\backend\requirements.txt"

# ── Dépendances frontend ──
if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "📦 Installation des dépendances Node.js (première fois)..." -ForegroundColor Gray
    Push-Location "$root\frontend"
    npm install
    Pop-Location
}

# ── Lancement (deux fenêtres) ──
Write-Host "🚀 Backend FastAPI  → http://localhost:8000" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; python -m uvicorn main:app --reload --port 8000"

Write-Host "🚀 Frontend Vite    → http://localhost:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

# ── Navigateur ──
Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "✅ Guard-X démarré. Fermez les deux fenêtres PowerShell pour arrêter." -ForegroundColor Cyan
