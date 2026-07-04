import io

import pandas as pd
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse

from utils.address_normalizer import normalize_address
from utils.fuzzy_matcher import match_score
from db import get_db

router = APIRouter()


@router.post("/clients/import")
async def import_clients(file: UploadFile = File(...)):
    """Import/refresh la base clients (export Sage ou fichier générique)."""
    data = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(data))
    except Exception:
        try:
            df = pd.read_csv(io.BytesIO(data))
        except Exception:
            return JSONResponse(
                status_code=400,
                content={"error": "Impossible de lire le fichier. Formats acceptés : .xlsx, .xls, .csv"},
            )
    df = df.fillna("")

    # Mapping Sage (NAMECUST, NAMECTAC, TEXTPHON1, TXDESC, TXADDRESS1) avec repli générique
    lower_map = {c.lower(): c for c in df.columns}

    def col(*names):
        for n in names:
            if n.lower() in lower_map:
                return lower_map[n.lower()]
        return None

    c_nom = col("NAMECUST", "Nom", "Client", "Entreprise", "Nom_Syndicat")
    c_contact = col("NAMECTAC", "Contact", "Nom_Gestionnaire")
    c_tel = col("TEXTPHON1", "Téléphone", "Telephone", "Phone")
    c_service = col("TXDESC", "Service")
    c_addr = col("TXADDRESS1", "Adresse", "Address")

    if not c_addr:
        return JSONResponse(
            status_code=400,
            content={"error": "Colonne d'adresse introuvable. Le fichier doit contenir TXADDRESS1 ou Adresse."},
        )

    rows = []
    for _, r in df.iterrows():
        adresse = str(r.get(c_addr, "")).strip()
        if not adresse:
            continue
        rows.append({
            "nom": str(r.get(c_nom, "")).strip() if c_nom else "",
            "contact": str(r.get(c_contact, "")).strip() if c_contact else "",
            "telephone": str(r.get(c_tel, "")).strip() if c_tel else "",
            "service": str(r.get(c_service, "")).strip() if c_service else "",
            "adresse": adresse,
            "adresse_normalisee": normalize_address(adresse),
        })

    if not rows:
        return JSONResponse(
            status_code=400,
            content={"error": "Aucune adresse valide trouvée dans le fichier."},
        )

    db = get_db()
    # La base clients est un instantané de l'export Sage : on remplace tout.
    db.table("base_clients").delete().gte("id", 0).execute()
    for i in range(0, len(rows), 500):
        db.table("base_clients").insert(rows[i:i + 500]).execute()

    db.table("activity_log").insert({
        "action": "clients_imported",
        "detail": f"Base clients mise à jour ({len(rows)} clients)",
        "detail_count": len(rows),
    }).execute()

    return {"status": "ok", "count": len(rows)}


@router.get("/clients/info")
def clients_info():
    """Nombre de clients + date du dernier import."""
    db = get_db()
    count_resp = db.table("base_clients").select("id", count="exact").limit(1).execute()
    count = count_resp.count or 0
    last = None
    if count:
        resp = db.table("base_clients").select("created_at").order("created_at", desc=True).limit(1).execute()
        last = resp.data[0]["created_at"] if resp.data else None
    return {"count": count, "last_import": last}


@router.post("/clients/check")
async def check_against_clients(body: dict):
    """Vérifie une liste de lignes contre la base clients (correspondance floue d'adresses).

    body: { rows: [...], address_field: "Adresse", threshold: 85 }
    """
    rows = body.get("rows", [])
    address_field = body.get("address_field", "Adresse")
    threshold = int(body.get("threshold", 85))

    db = get_db()
    clients = (db.table("base_clients").select("nom,adresse,adresse_normalisee").execute()).data or []
    if not clients:
        return {
            "checked": False,
            "message": "Base clients vide — importez votre export Sage dans la page Base clients.",
            "flagged": 0,
            "results": [],
        }

    results = []
    for i, row in enumerate(rows):
        raw = str(row.get(address_field, "") or row.get(address_field.lower(), ""))
        if not raw.strip():
            continue
        best = 0.0
        best_client = None
        for c in clients:
            s = match_score(raw, c["adresse"])
            if s > best:
                best = s
                best_client = c
        if best >= threshold and best_client:
            results.append({
                "index": i,
                "adresse": raw,
                "score": round(best, 1),
                "client": best_client["nom"],
                "adresse_client": best_client["adresse"],
            })

    return {"checked": True, "total": len(rows), "flagged": len(results), "results": results}
