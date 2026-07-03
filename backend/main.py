import json
import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routes import letters, duplicates, properties

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

app = FastAPI(title="Guard-X Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve assets (logo etc.)
app.mount("/assets", StaticFiles(directory=os.path.join(BASE_DIR, "assets")), name="assets")

app.include_router(letters.router, prefix="/api", tags=["letters"])
app.include_router(duplicates.router, prefix="/api", tags=["duplicates"])
app.include_router(properties.router, prefix="/api", tags=["properties"])


def load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_config(cfg: dict):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


@app.get("/api/config")
def get_config():
    return load_config()


@app.put("/api/config")
async def update_config(body: dict):
    save_config(body)
    return {"status": "ok", "config": body}


@app.get("/api/activity")
def get_activity():
    """Return recent activity log (last 5 entries)."""
    log_path = os.path.join(BASE_DIR, "activity_log.json")
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
            entries = json.load(f)
        return entries[:5]
    return []


@app.post("/api/activity")
async def log_activity(body: dict):
    """Append an activity entry and keep last 50."""
    from datetime import datetime
    log_path = os.path.join(BASE_DIR, "activity_log.json")
    entries = []
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
            entries = json.load(f)
    entry = {
        "action": body.get("action", ""),
        "detail": body.get("detail", ""),
        "timestamp": datetime.now().isoformat(),
    }
    entries.insert(0, entry)
    entries = entries[:50]
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    return {"status": "ok"}


@app.post("/api/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    """Replace the guardx_logo.png file."""
    import shutil
    logo_path = os.path.join(BASE_DIR, "assets", "guardx_logo.png")
    with open(logo_path, "wb") as f:
        f.write(await file.read())
    return {"status": "ok", "path": "assets/guardx_logo.png"}


@app.post("/api/import-prospects")
async def import_prospects(file: UploadFile = File(...)):
    """Import an Excel file and return ALL rows as JSON."""
    import io
    import pandas as pd
    df = pd.read_excel(io.BytesIO(await file.read()))
    df = df.fillna("")
    columns = list(df.columns)
    rows = df.to_dict(orient="records")
    return {"columns": columns, "rows": rows, "total_rows": len(df)}


PROSPECTS_PATH = os.path.join(BASE_DIR, "prospects_data.json")


@app.get("/api/prospects")
def get_prospects():
    """Load all persisted prospects."""
    if os.path.exists(PROSPECTS_PATH):
        with open(PROSPECTS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


@app.post("/api/prospects")
async def save_prospects(body: dict):
    """Save full prospect list (overwrite)."""
    prospects = body.get("prospects", [])
    with open(PROSPECTS_PATH, "w", encoding="utf-8") as f:
        json.dump(prospects, f, ensure_ascii=False, indent=2)
    return {"status": "ok", "count": len(prospects)}


@app.post("/api/prospects/add")
async def add_prospects(body: dict):
    """Add new prospects to the persisted list (merge, avoid exact duplicates)."""
    new_rows = body.get("prospects", [])
    existing = []
    if os.path.exists(PROSPECTS_PATH):
        with open(PROSPECTS_PATH, "r", encoding="utf-8") as f:
            existing = json.load(f)

    def dedup_key(p):
        addr = str(p.get("Adresse", "") or p.get("adresse", "")).lower().strip()
        nb = str(p.get("Nb_Unites", "") or p.get("nb_unites", "")).strip()
        notes = str(p.get("Notes", "") or p.get("notes", "")).lower().strip()
        return f"{addr}|{nb}|{notes}"

    existing_keys = {dedup_key(p) for p in existing}
    max_id = max([p.get("id", 0) for p in existing], default=0)

    added = 0
    for row in new_rows:
        key = dedup_key(row)
        if key in existing_keys:
            continue
        max_id += 1
        existing.append({
            "id": max_id,
            "entreprise": row.get("Nom_Syndicat", "") or row.get("Entreprise", ""),
            "contact": row.get("Nom_Gestionnaire", "") or row.get("Contact", ""),
            "telephone": row.get("Téléphone", "") or row.get("Telephone", "") or "",
            "statut": "À contacter",
            "date": row.get("Date", "") or "",
            "notes": row.get("Notes", ""),
            "adresse": row.get("Adresse", ""),
            "ville": row.get("Ville_CodePostal", ""),
            "nb_unites": row.get("Nb_Unites", ""),
            "secteur": row.get("Secteur", ""),
            "contacte": False,
            "date_contact": "",
        })
        existing_keys.add(key)
        added += 1

    with open(PROSPECTS_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    return {"status": "ok", "added": added, "total": len(existing)}


@app.get("/api/kpis")
def get_kpis():
    """Return KPI counts from activity log."""
    log_path = os.path.join(BASE_DIR, "activity_log.json")
    entries = []
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
            entries = json.load(f)
    from datetime import datetime, date
    today = date.today().isoformat()
    letters_today = sum(1 for e in entries if e.get("action") == "letters_generated" and e.get("timestamp", "").startswith(today))
    duplicates_removed = sum(e.get("detail_count", 0) for e in entries if e.get("action") == "duplicates_checked")
    properties_targeted = sum(e.get("detail_count", 0) for e in entries if e.get("action") == "properties_filtered")
    prospects = sum(e.get("detail_count", 0) for e in entries if e.get("action") == "prospects_imported")
    return {
        "letters_today": letters_today,
        "prospects": prospects,
        "duplicates_removed": duplicates_removed,
        "properties_targeted": properties_targeted,
    }
