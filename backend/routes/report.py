import io
from datetime import datetime

import pandas as pd
from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse

from db import get_db

router = APIRouter()

MONTHS_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

ACTION_LABELS = {
    "letters_generated": "Lettres générées",
    "duplicates_checked": "Vérification de doublons",
    "properties_filtered": "Ciblage copropriétés",
    "prospects_imported": "Prospects importés",
    "clients_imported": "Base clients mise à jour",
    "appel": "Appel",
    "visite": "Visite terrain",
    "courriel": "Courriel envoyé",
    "soumission": "Soumission envoyée",
    "vente": "Vente signée",
}

STATUTS_VENDUS = ("Vendu / Signé", "Récupéré (signé)")
STATUTS_SOUMISSION = ("Soumission envoyée", "Soumission révisée", "En fermeture")
STATUTS_INACTIFS = ("Perdu (revisiter année suivante)", "Hors d'affaires")


@router.post("/report/monthly")
async def monthly_report(body: dict):
    """Génère le rapport mensuel Excel pour Mel : KPI + onglet du mois + pipeline."""
    try:
        year = int(body.get("year", datetime.now().year))
        month = int(body.get("month", datetime.now().month))
        if not 1 <= month <= 12:
            raise ValueError
    except (TypeError, ValueError):
        return JSONResponse(status_code=400, content={"error": "Mois ou année invalide."})

    db = get_db()
    prefix = f"{year:04d}-{month:02d}"
    acts = (db.table("activity_log").select("*").execute()).data or []
    month_acts = [a for a in acts if (a.get("created_at", "") or "").startswith(prefix)]
    prospects = (db.table("prospects").select("*").execute()).data or []

    month_name = MONTHS_FR[month - 1]

    # ── KPI ──
    ventes_total = sum(1 for p in prospects if p.get("statut") in STATUTS_VENDUS)
    soumissions_actives = sum(1 for p in prospects if p.get("statut") in STATUTS_SOUMISSION)
    suivi_actif = sum(1 for p in prospects if p.get("statut") not in STATUTS_INACTIFS)

    def count_action(action):
        return sum(1 for a in month_acts if a.get("action") == action)

    def sum_action(action):
        return sum(a.get("detail_count", 0) for a in month_acts if a.get("action") == action)

    kpi_df = pd.DataFrame([
        {"Indicateur": "Ventes signées depuis l'embauche", "Valeur": ventes_total},
        {"Indicateur": f"Ventes signées ({month_name})", "Valeur": count_action("vente")},
        {"Indicateur": f"Soumissions envoyées ({month_name})", "Valeur": count_action("soumission")},
        {"Indicateur": "Soumissions actives (pipeline)", "Valeur": soumissions_actives},
        {"Indicateur": f"Appels ({month_name})", "Valeur": count_action("appel")},
        {"Indicateur": f"Visites terrain ({month_name})", "Valeur": count_action("visite")},
        {"Indicateur": f"Courriels ({month_name})", "Valeur": count_action("courriel")},
        {"Indicateur": f"Lettres générées ({month_name})", "Valeur": sum_action("letters_generated")},
        {"Indicateur": "Clients en suivi actif", "Valeur": suivi_actif},
    ])

    # ── Onglet du mois : journal d'activité ──
    month_cols = ["Date", "Action", "Détail", "Quantité"]
    month_df = pd.DataFrame([
        {
            "Date": (a.get("created_at", "") or "")[:10],
            "Action": ACTION_LABELS.get(a.get("action", ""), a.get("action", "")),
            "Détail": a.get("detail", ""),
            "Quantité": a.get("detail_count", 0),
        }
        for a in sorted(month_acts, key=lambda a: a.get("created_at", ""))
    ], columns=month_cols)

    # ── Adresses prospectées du mois : preuve concrète du travail terrain ──
    # Sources: prospects ajoutés dans le mois (table prospects, champ date)
    # + adresses extraites des journaux « lettres générées » du mois.
    addr_rows = []
    for p in prospects:
        p_date = str(p.get("date", "") or "")
        if p_date.startswith(prefix) and (p.get("adresse") or p.get("entreprise")):
            addr_rows.append({
                "Date": p_date,
                "Type": "Prospect ajouté",
                "Syndicat / Entreprise": p.get("entreprise", ""),
                "Adresse": p.get("adresse", ""),
                "Ville / Secteur": p.get("ville", "") or p.get("secteur", ""),
                "Statut": p.get("statut", ""),
                "Contacté": "Oui" if p.get("contacte") else "Non",
            })
    for a in month_acts:
        if a.get("action") != "letters_generated":
            continue
        detail = str(a.get("detail", "") or "")
        if " — " in detail:
            for addr in detail.split(" — ", 1)[1].split("; "):
                addr = addr.strip()
                if addr and not addr.startswith("(+"):
                    addr_rows.append({
                        "Date": (a.get("created_at", "") or "")[:10],
                        "Type": "Lettre envoyée",
                        "Syndicat / Entreprise": "",
                        "Adresse": addr,
                        "Ville / Secteur": "",
                        "Statut": "",
                        "Contacté": "",
                    })
    addr_cols = ["Date", "Type", "Syndicat / Entreprise", "Adresse", "Ville / Secteur", "Statut", "Contacté"]
    addr_df = pd.DataFrame(sorted(addr_rows, key=lambda r: r["Date"]), columns=addr_cols)

    # ── Pipeline complet ──
    pipe_cols = ["Entreprise", "Contact", "Segment", "Statut", "Prochaine action",
                 "Adresse", "Secteur", "Téléphone", "Notes"]
    pipe_df = pd.DataFrame([
        {
            "Entreprise": p.get("entreprise", ""),
            "Contact": p.get("contact", ""),
            "Segment": p.get("segment", ""),
            "Statut": p.get("statut", ""),
            "Prochaine action": p.get("next_action", ""),
            "Adresse": p.get("adresse", ""),
            "Secteur": p.get("secteur", ""),
            "Téléphone": p.get("telephone", ""),
            "Notes": p.get("notes", ""),
        }
        for p in prospects
    ], columns=pipe_cols)

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        kpi_df.to_excel(writer, sheet_name="KPI", index=False)
        month_df.to_excel(writer, sheet_name=f"{month_name} {year}", index=False)
        addr_df.to_excel(writer, sheet_name="Adresses prospectées", index=False)
        pipe_df.to_excel(writer, sheet_name="Pipeline", index=False)
    buf.seek(0)

    filename = f"rapport_prospection_{year}_{month:02d}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
