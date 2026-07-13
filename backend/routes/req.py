"""REQ (Registre des entreprises du Québec) matching module.

Endpoints:
  POST /api/req-import  — Import REQ CSV, filter syndicats, store in Supabase
  GET  /api/req-info    — Count + last import date
  POST /api/req-match   — Match buildings against req_syndicats

LEGAL RULE: Administrator/person names are NOT extracted from REQ data.
Nom_Gestionnaire stays empty; letters use fallback "Au président du syndicat".
"""

import io
import re
import zipfile
import traceback
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
from rapidfuzz import fuzz

from utils.address_normalizer import normalize_address
from utils.req_matcher import extract_address_from_name, score_extracted
from utils.fuzzy_matcher import match_score
from utils.zone_mapper import assign_zone_and_rue
from db import get_db

router = APIRouter()

# Configurable postal code prefixes for Anjou
ANJOU_POSTAL_PREFIXES = ["H1J", "H1K"]

CHUNK_SIZE = 50000
BATCH_INSERT = 1000

# ── REQ open data: 3 files needed from the ZIP ──
# The Données Québec ZIP contains 5+ CSV files joined by NEQ.
# We only need these 3:
#   Entreprise   → NEQ, forme juridique, statut immatriculation
#   Nom          → NEQ, NOM_ASSUJ (company name, used to filter syndicats)
#   Etablissement → NEQ, addresses (domicile, domicile élu/correspondance)

# Column candidates for each file (REQ uses French column names)
# Per the official guide (guideutilisation.pdf), Entreprise.csv contains:
#   COD_STAT_IMMAT  — registration status CODE (IM, RD, RO, RX...)
#   COD_FORME_JURI  — legal form CODE (not text)
#   ADR_DOMCL_LIGN1_ADR..LIGN4 — the DOMICILE ADDRESS shown on the REQ website
ENT_COL_MAP = {
    "neq": ["NEQ", "NUMERO_ENTREPRISE"],
    "forme_juridique": ["COD_FORME_JURI", "FORME_JURIDIQUE", "FRM_JURD", "CODE_FORME_JURIDIQUE"],
    "statut": ["COD_STAT_IMMAT", "STAT_IMMAT", "STATUT_IMMAT", "STATUT", "ETAT"],
    "addr_l1": ["ADR_DOMCL_LIGN1_ADR"],
    "addr_l2": ["ADR_DOMCL_LIGN2_ADR"],
    "addr_l3": ["ADR_DOMCL_LIGN3_ADR"],
    "addr_l4": ["ADR_DOMCL_LIGN4_ADR"],
}

# COD_STAT_IMMAT code → human-readable status (per REQ reference guide)
STATUT_CODE_MAP = {
    "IM": "Immatriculée",
    "RD": "Radiée sur demande",
    "RO": "Radiée d'office",
    "RX": "Radiée d'office",
    "IA": "Immatriculation annulée",
    "NI": "Non immatriculée",
    "AI": "Avis d'intention",
}

NOM_COL_MAP = {
    "neq": ["NEQ", "NUMERO_ENTREPRISE"],
    "nom": ["NOM_ASSUJ", "NOM_ENTREPRISE", "NOM", "RAISON_SOCIALE"],
    "type_nom": ["TYP_NOM_ASSUJ", "TYPE_NOM", "TYP_NOM"],
}

ETAB_COL_MAP = {
    "neq": ["NEQ", "NUMERO_ENTREPRISE"],
    "type_etab": ["TYP_ETAB", "TYPE_ETABLISSEMENT", "IND_ETAB", "IND_ETAB_PRINC"],
    "addr_l1": ["LIGN1_ADR", "ADR_ETAB_1", "LIGNE_ADR_1", "ADRESSE1", "ADR_1"],
    "addr_l2": ["LIGN2_ADR", "ADR_ETAB_2", "LIGNE_ADR_2", "ADRESSE2", "ADR_2"],
    "ville": ["LIGN3_ADR", "LOCALITE_ETAB", "VILLE", "LOCALITE", "NM_MUNIC"],
    "cp": ["LIGN4_ADR", "CODE_POSTAL_ETAB", "CODE_POSTAL", "CP", "CD_PSTL"],
}

# Etablissement type codes (from DomaineValeur.csv)
# Type 1 = domicile (head office), Type 2 = domicile élu (correspondence)
ETAB_TYPE_DOMICILE = ["1", "D", "DOMICILE"]
ETAB_TYPE_POSTALE = ["2", "E", "DOMICILE_ELU", "CORRESPONDANCE"]


def _split_domcl_lines(*lines):
    """Split the 4 REQ domicile address lines into (street_address, ville_cp).

    Example lines: ["244 rue Saint-Raphaël", "Montréal (Québec) H9E1S2", "Canada"]
    → ("244 rue Saint-Raphaël", "Montréal (Québec) H9E1S2")
    """
    clean = [str(v).strip() for v in lines if v and str(v).strip() and str(v).strip() != "0"]
    clean = [v for v in clean if v.upper() != "CANADA"]
    if not clean:
        return "", ""
    # The ville/CP line contains a postal code (A1A 1A1) or "(Québec)"
    idx = None
    for i, v in enumerate(clean):
        if re.search(r"[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d", v) or "(qu" in v.lower():
            idx = i
            break
    if idx is None or idx == 0:
        if len(clean) == 1:
            return clean[0], ""
        return ", ".join(clean[:-1]), clean[-1]
    return ", ".join(clean[:idx]), " ".join(clean[idx:])


def _detect_encoding_and_sep(content: bytes):
    """Detect encoding and separator from first 64KB."""
    sample = content[:65536]
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            bio = io.BytesIO(sample)
            df = pd.read_csv(bio, encoding=enc, sep=",", nrows=5)
            if len(df.columns) <= 1:
                bio.seek(0)
                df = pd.read_csv(bio, encoding=enc, sep=";", nrows=5)
                return enc, ";"
            return enc, ","
        except UnicodeDecodeError:
            continue
    return None, None


def _find_col(columns, candidates):
    lower_map = {c.lower(): c for c in columns}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    return None


def _is_syndicat_name(nom: str) -> bool:
    """Check if a company name is a syndicat de copropriété."""
    if not nom:
        return False
    nom_upper = nom.upper()
    return "SYNDICAT" in nom_upper and ("COPROPRI" in nom_upper or "CONDOMINIUM" in nom_upper)


def _is_syndicat_forme(fj: str) -> bool:
    """Check if a legal form indicates a syndicat de copropriété."""
    if not fj:
        return False
    fj_lower = fj.lower()
    return "syndicat" in fj_lower and ("copropri" in fj_lower or "condominium" in fj_lower)


def _build_addr(row, col_l1, col_l2, col_ville, col_cp):
    """Build a full address string from columns."""
    parts = []
    if col_l1:
        v = str(row.get(col_l1, "")).strip()
        if v and v != "0":
            parts.append(v)
    if col_l2:
        v = str(row.get(col_l2, "")).strip()
        if v and v != "0":
            parts.append(v)
    addr_line = ", ".join(parts) if parts else ""

    ville_cp_parts = []
    if col_ville:
        v = str(row.get(col_ville, "")).strip()
        if v and v != "0":
            ville_cp_parts.append(v)
    if col_cp:
        v = str(row.get(col_cp, "")).strip()
        if v and v != "0":
            ville_cp_parts.append(v)
    ville_cp = " ".join(ville_cp_parts) if ville_cp_parts else ""

    return addr_line, ville_cp


def _identify_zip_files(namelist):
    """Identify which CSV files in the ZIP are Entreprise, Nom, Etablissement.
    
    The REQ ZIP uses French names like 'Entreprise.csv', 'Nom.csv', 'Etablissement.csv'.
    We match case-insensitively on the filename.
    """
    ent_file = nom_file = etab_file = None
    for name in namelist:
        lower = name.lower()
        if lower.endswith(".csv"):
            basename = lower.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
            if "entreprise" in basename:
                ent_file = name
            elif "nom" in basename and "domaine" not in basename:
                nom_file = name
            elif "etab" in basename or "etablissement" in basename:
                etab_file = name
    return ent_file, nom_file, etab_file


@router.post("/req-import")
async def req_import(file: UploadFile = File(...)):
    """Import REQ open data ZIP from Données Québec.
    
    The ZIP contains multiple CSV files. We extract and join 3 of them:
      - Entreprise: NEQ, forme juridique, statut
      - Nom: NEQ, company name (NOM_ASSUJ)
      - Etablissement: NEQ, addresses (domicile + correspondence)
    
    Filter to syndicats de copropriété, store in Supabase req_syndicats table.
    """
    try:
        content = await file.read()

        # Check if it's a ZIP or a single CSV
        if not file.filename.lower().endswith(".zip"):
            return JSONResponse(
                status_code=400,
                content={"error": "Veuillez téléverser le fichier ZIP complet téléchargé de Données Québec (registre-des-entreprises)."},
            )

        zf = zipfile.ZipFile(io.BytesIO(content))
        namelist = zf.namelist()
        print(f"[REQ Import] ZIP contains: {namelist}")

        ent_file, nom_file, etab_file = _identify_zip_files(namelist)

        missing = []
        if not ent_file:
            missing.append("Entreprise")
        if not nom_file:
            missing.append("Nom")
        # Etablissement is optional — used only as address fallback

        if missing:
            return JSONResponse(
                status_code=400,
                content={"error": f"Fichiers manquants dans le ZIP: {', '.join(missing)}. Fichiers trouvés: {', '.join(namelist)}"},
            )

        print(f"[REQ Import] Using files: Entreprise={ent_file}, Nom={nom_file}, Etablissement={etab_file}")

        # ── Step 1: Read Nom file — identify syndicats by name pattern (primary filter) ──
        # Note: COD_FORME_JURI in Entreprise.csv is a CODE (not text), so the name
        # pattern in Nom.csv is the reliable way to identify syndicats de copropriété.
        nom_content = zf.read(nom_file)
        nom_enc, nom_sep = _detect_encoding_and_sep(nom_content)
        if nom_enc is None:
            return JSONResponse(status_code=400, content={"error": f"Impossible de lire {nom_file}. Vérifiez l'encodage."})

        nom_header = pd.read_csv(io.BytesIO(nom_content), encoding=nom_enc, sep=nom_sep, nrows=0)
        nom_cols = list(nom_header.columns)
        nom_map = {k: _find_col(nom_cols, v) for k, v in NOM_COL_MAP.items()}
        print(f"[REQ Import] Nom columns: {nom_cols}")
        print(f"[REQ Import] Nom mapped: {nom_map}")

        nom_usecols = [c for c in [nom_map["neq"], nom_map["nom"]] if c]
        nom_df = pd.read_csv(io.BytesIO(nom_content), encoding=nom_enc, sep=nom_sep,
                             usecols=nom_usecols, dtype=str, keep_default_na=False)
        total_nom_scanned = len(nom_df)
        print(f"[REQ Import] Nom loaded: {total_nom_scanned} rows")

        # Filter: rows where name matches syndicat pattern
        nom_col = nom_map["nom"]
        neq_col_n = nom_map["neq"]
        nom_df[neq_col_n] = nom_df[neq_col_n].str.strip()

        # SYNDICAT + (COPROPRI or CONDOMINIUM)
        name_mask = nom_df[nom_col].str.upper().str.contains("SYNDICAT", na=False) & (
            nom_df[nom_col].str.upper().str.contains("COPROPRI", na=False) |
            nom_df[nom_col].str.upper().str.contains("CONDOMINIUM", na=False)
        )
        syndicat_nom = nom_df[name_mask].copy()
        syndicat_neqs = set(syndicat_nom[neq_col_n])
        syndicat_neqs.discard("")

        # Build NEQ → name (first name per NEQ)
        neq_to_name = {}
        for neq, group in syndicat_nom.groupby(neq_col_n):
            neq_to_name[neq] = group[nom_col].iloc[0].strip()

        print(f"[REQ Import] Found {len(syndicat_neqs)} syndicats by name pattern")
        del nom_df, syndicat_nom

        # ── Step 2: Read Entreprise file — statut + ADRESSE DU DOMICILE (official REQ address) ──
        ent_content = zf.read(ent_file)
        ent_enc, ent_sep = _detect_encoding_and_sep(ent_content)
        if ent_enc is None:
            return JSONResponse(status_code=400, content={"error": f"Impossible de lire {ent_file}. Vérifiez l'encodage."})

        ent_header = pd.read_csv(io.BytesIO(ent_content), encoding=ent_enc, sep=ent_sep, nrows=0)
        ent_cols = list(ent_header.columns)
        ent_map = {k: _find_col(ent_cols, v) for k, v in ENT_COL_MAP.items()}
        print(f"[REQ Import] Entreprise mapped: {ent_map}")

        if not ent_map["neq"]:
            return JSONResponse(status_code=400, content={"error": f"Colonne NEQ introuvable dans {ent_file}. Colonnes: {', '.join(ent_cols[:20])}"})

        ent_usecols = [c for c in [ent_map["neq"], ent_map["statut"], ent_map["addr_l1"],
                                    ent_map["addr_l2"], ent_map["addr_l3"], ent_map["addr_l4"]] if c]
        ent_df = pd.read_csv(io.BytesIO(ent_content), encoding=ent_enc, sep=ent_sep,
                             usecols=ent_usecols, dtype=str, keep_default_na=False)
        total_ent_scanned = len(ent_df)
        print(f"[REQ Import] Entreprise loaded: {total_ent_scanned} rows")

        # Filter to syndicat NEQs only
        neq_col_ent = ent_map["neq"]
        ent_df[neq_col_ent] = ent_df[neq_col_ent].str.strip()
        ent_synd = ent_df[ent_df[neq_col_ent].isin(syndicat_neqs)]
        print(f"[REQ Import] Entreprise rows for syndicats: {len(ent_synd)}")
        del ent_df

        # Build NEQ → statut (decoded) and NEQ → domicile address (ADR_DOMCL lines)
        neq_to_statut = {}
        neq_to_dom = {}
        stat_col = ent_map["statut"]
        l1, l2, l3, l4 = ent_map["addr_l1"], ent_map["addr_l2"], ent_map["addr_l3"], ent_map["addr_l4"]

        for _, row in ent_synd.iterrows():
            neq = row[neq_col_ent]
            if not neq or neq in neq_to_dom:
                continue
            if stat_col:
                code = str(row.get(stat_col, "")).strip().upper()
                neq_to_statut[neq] = STATUT_CODE_MAP.get(code, code)
            lines = [row.get(c, "") if c else "" for c in (l1, l2, l3, l4)]
            addr, ville_cp = _split_domcl_lines(*lines)
            if addr or ville_cp:
                neq_to_dom[neq] = (addr, ville_cp)

        del ent_synd
        print(f"[REQ Import] Domicile addresses from Entreprise: {len(neq_to_dom)}")

        # ── Step 3: Etablissement — FALLBACK only, for syndicats without domicile address ──
        neq_to_post = {}
        total_etab_scanned = 0
        missing_addr_neqs = syndicat_neqs - set(neq_to_dom.keys())
        if etab_file and missing_addr_neqs:
            etab_content = zf.read(etab_file)
            etab_enc, etab_sep = _detect_encoding_and_sep(etab_content)
            if etab_enc is not None:
                etab_header = pd.read_csv(io.BytesIO(etab_content), encoding=etab_enc, sep=etab_sep, nrows=0)
                etab_cols = list(etab_header.columns)
                etab_map = {k: _find_col(etab_cols, v) for k, v in ETAB_COL_MAP.items()}
                print(f"[REQ Import] Etablissement mapped: {etab_map}")

                if etab_map["neq"]:
                    etab_usecols = [c for c in [etab_map["neq"], etab_map["addr_l1"],
                                                 etab_map["addr_l2"], etab_map["ville"], etab_map["cp"]] if c]
                    etab_df = pd.read_csv(io.BytesIO(etab_content), encoding=etab_enc, sep=etab_sep,
                                          usecols=etab_usecols, dtype=str, keep_default_na=False)
                    total_etab_scanned = len(etab_df)
                    neq_col_e = etab_map["neq"]
                    etab_df[neq_col_e] = etab_df[neq_col_e].str.strip()
                    etab_synd = etab_df[etab_df[neq_col_e].isin(missing_addr_neqs)]
                    del etab_df

                    addr_cols = [etab_map["addr_l1"], etab_map["addr_l2"]]
                    ville_cp_cols = [etab_map["ville"], etab_map["cp"]]

                    def _join_fields(row, cols):
                        parts = []
                        for c in cols:
                            if c:
                                v = str(row.get(c, "")).strip()
                                if v and v != "0":
                                    parts.append(v)
                        return ", ".join(parts) if parts else ""

                    for _, row in etab_synd.iterrows():
                        neq = row[neq_col_e]
                        if neq not in neq_to_dom:
                            addr = _join_fields(row, addr_cols)
                            ville_cp = _join_fields(row, ville_cp_cols)
                            if addr or ville_cp:
                                neq_to_dom[neq] = (addr, ville_cp)
                    del etab_synd

        print(f"[REQ Import] Total addresses: {len(neq_to_dom)} domicile")

        # ── Step 4: Build result rows ──
        results = []
        for neq in syndicat_neqs:
            nom = neq_to_name.get(neq, "")
            if not nom:
                continue

            statut = neq_to_statut.get(neq, "")
            addr_dom, ville_cp_dom = neq_to_dom.get(neq, ("", ""))
            addr_post, ville_cp_post = neq_to_post.get(neq, ("", ""))

            results.append({
                "neq": neq,
                "nom": nom,
                "statut_immat": statut,
                "adresse_domicile": addr_dom,
                "adresse_postale": addr_post,
                "ville_cp_domicile": ville_cp_dom,
                "ville_cp_postale": ville_cp_post,
                "nom_normalise": normalize_address(nom),
                "adresse_domicile_normalisee": normalize_address(addr_dom) if addr_dom else "",
                "adresse_postale_normalisee": normalize_address(addr_post) if addr_post else "",
            })

        total_scanned = max(total_ent_scanned, total_nom_scanned, total_etab_scanned)

        if not results:
            return JSONResponse(
                status_code=200,
                content={"status": "ok", "count": 0, "total_scanned": total_scanned,
                         "message": "Aucun syndicat de copropriété trouvé dans ce fichier."},
            )

        # Batch insert into Supabase
        db = get_db()
        db.table("req_syndicats").delete().gte("id", 0).execute()
        for i in range(0, len(results), BATCH_INSERT):
            db.table("req_syndicats").insert(results[i:i + BATCH_INSERT]).execute()

        db.table("activity_log").insert({
            "action": "req_imported",
            "detail": f"Base REQ mise à jour ({len(results)} syndicats)",
            "detail_count": len(results),
        }).execute()

        return {
            "status": "ok",
            "count": len(results),
            "total_scanned": total_scanned,
            "files_used": {"Entreprise": ent_file, "Nom": nom_file, "Etablissement": etab_file},
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@router.get("/req-info")
def req_info():
    """Return REQ syndicat count + last import date."""
    db = get_db()
    count_resp = db.table("req_syndicats").select("id", count="exact").limit(1).execute()
    count = count_resp.count or 0
    last = None
    if count:
        resp = db.table("req_syndicats").select("imported_at").order("imported_at", desc=True).limit(1).execute()
        last = resp.data[0]["imported_at"] if resp.data else None
    return {"count": count, "last_import": last}


@router.post("/req-match")
async def req_match(body: dict):
    """Match buildings against req_syndicats.

    Input: { rows: [...building dicts from property filter...] }
    Output: { matched: [...], uncertain: [...], no_syndicat: [...], all: [...] }
    """
    rows = body.get("rows", [])
    if not rows:
        return {"matched": [], "uncertain": [], "no_syndicat": [], "all": []}

    db = get_db()
    syndicats = (db.table("req_syndicats").select("*").execute()).data or []
    if not syndicats:
        return JSONResponse(
            status_code=200,
            content={
                "matched": [],
                "uncertain": [],
                "no_syndicat": [{"row": r, "match_score": 0, "source_adresse": "Immeuble"} for r in rows],
                "all": [],
                "message": "Base REQ vide — importez le fichier REQ dans la page Croisement REQ.",
            },
        )

    # Precompute per-syndicat data ONCE (not per building × syndicat pair)
    for s in syndicats:
        s["_extracted"] = extract_address_from_name(s.get("nom_normalise", ""))

    matched_rows = []
    uncertain_rows = []
    no_syndicat_rows = []

    for building in rows:
        b_address = str(building.get("Adresse", "")).strip()
        b_civic = str(building.get("Civic", "")).strip()
        b_norm = normalize_address(b_address)

        best_score = 0.0
        best_syndicat = None
        best_source = "name"  # "name" or "domicile"

        for synd in syndicats:
            # Signal 1: name → address extraction (precomputed extraction)
            name_score = score_extracted(synd["_extracted"], b_norm) if synd["_extracted"] else 0.0

            # Signal 2: building address vs domicile address (both pre-normalized)
            addr_dom_norm = synd.get("adresse_domicile_normalisee", "")
            dom_score = fuzz.token_sort_ratio(b_norm, addr_dom_norm) if (b_norm and addr_dom_norm) else 0.0

            # Combined score: take the max of both signals
            combined = max(name_score, dom_score)

            if combined > best_score:
                best_score = combined
                best_syndicat = synd
                best_source = "name" if name_score >= dom_score else "domicile"

        # Determine Adresse_Envoi
        source_adresse = "Immeuble"
        adresse_envoi = b_address
        ville_cp_envoi = str(building.get("Ville_CodePostal", "")).strip()

        if best_syndicat:
            # Priority: adresse_postale > adresse_domicile > building
            addr_post = best_syndicat.get("adresse_postale", "").strip()
            ville_post = best_syndicat.get("ville_cp_postale", "").strip()
            addr_dom = best_syndicat.get("adresse_domicile", "").strip()
            ville_dom = best_syndicat.get("ville_cp_domicile", "").strip()

            if addr_post and (ville_post or addr_post != b_address):
                source_adresse = "REQ-postale"
                adresse_envoi = addr_post
                ville_cp_envoi = ville_post
            elif addr_dom and addr_dom != b_address:
                source_adresse = "REQ-domicile"
                adresse_envoi = addr_dom
                ville_cp_envoi = ville_dom
            else:
                source_adresse = "Immeuble"

        # Build output row in letter-generator schema
        nom_syndicat = best_syndicat["nom"] if best_syndicat else ""
        neq = best_syndicat["neq"] if best_syndicat else ""
        statut_immat = best_syndicat["statut_immat"] if best_syndicat else ""
        is_radie = "radié" in statut_immat.lower() if statut_immat else False

        notes_parts = [f"Score: {round(best_score, 1)}", f"Source: {source_adresse}"]
        if is_radie:
            notes_parts.append("⚠ STATUT RADIÉ")
        notes = " | ".join(notes_parts)

        output_row = {
            "Nom_Gestionnaire": "",
            "Nom_Syndicat": nom_syndicat,
            "Civic": b_civic,
            "Adresse": adresse_envoi,
            "Ville_CodePostal": ville_cp_envoi,
            "Nb_Unites": building.get("Nb_Unites", ""),
            "Secteur": building.get("Secteur", ""),
            "Code_Utilisation": building.get("Code_Utilisation", ""),
            "Notes": notes,
            "Adresse_Immeuble": b_address,
            "Ville_CodePostal_Immeuble": str(building.get("Ville_CodePostal", "")).strip(),
            "NEQ": neq,
            "Statut_REQ": statut_immat,
            "match_score": round(best_score, 1),
            "source_adresse": source_adresse,
            "is_radie": is_radie,
        }

        if best_score >= 85:
            matched_rows.append(output_row)
        elif best_score >= 50:
            uncertain_rows.append(output_row)
        else:
            no_syndicat_rows.append(output_row)

    return {
        "matched": matched_rows,
        "uncertain": uncertain_rows,
        "no_syndicat": no_syndicat_rows,
        "all": matched_rows + uncertain_rows + no_syndicat_rows,
        "total": len(rows),
        "matched_count": len(matched_rows),
        "uncertain_count": len(uncertain_rows),
        "no_syndicat_count": len(no_syndicat_rows),
    }


# ── Phase E: REQ businesses-by-street import (Zones 1-3) ──

@router.post("/req-import-by-postal")
async def req_import_by_postal(file: UploadFile = File(...)):
    """Filter REQ dump by établissement postal codes (H1J/H1K = Anjou).

    Reads the ZIP (Entreprise + Nom + Etablissement), filters établissements
    whose postal code starts with a configured prefix, joins with Entreprise
    for legal name/NEQ and Nom for company name, auto-assigns zone/rue,
    fuzzy-deduplicates against existing prospects AND base_clients,
    and returns rows grouped by street for preview.
    """
    try:
        content = await file.read()
        if not file.filename.lower().endswith(".zip"):
            return JSONResponse(status_code=400,
                content={"error": "Veuillez téléverser le fichier ZIP complet de Données Québec."})

        zf = zipfile.ZipFile(io.BytesIO(content))
        namelist = zf.namelist()
        ent_file, nom_file, etab_file = _identify_zip_files(namelist)

        if not ent_file or not nom_file or not etab_file:
            missing = [n for n, f in [("Entreprise", ent_file), ("Nom", nom_file), ("Etablissement", etab_file)] if not f]
            return JSONResponse(status_code=400,
                content={"error": f"Fichiers manquants: {', '.join(missing)}. Trouvés: {', '.join(namelist)}"})

        # ── Read Etablissement — filter by postal code prefix ──
        etab_content = zf.read(etab_file)
        etab_enc, etab_sep = _detect_encoding_and_sep(etab_content)
        if etab_enc is None:
            return JSONResponse(status_code=400, content={"error": f"Impossible de lire {etab_file}."})

        etab_header = pd.read_csv(io.BytesIO(etab_content), encoding=etab_enc, sep=etab_sep, nrows=0)
        etab_cols = list(etab_header.columns)
        etab_map = {k: _find_col(etab_cols, v) for k, v in ETAB_COL_MAP.items()}

        if not etab_map["neq"] or not etab_map["cp"]:
            return JSONResponse(status_code=400, content={"error": "Colonnes NEQ ou code postal introuvables dans Etablissement."})

        etab_usecols = [c for c in [etab_map["neq"], etab_map["addr_l1"], etab_map["addr_l2"],
                                     etab_map["ville"], etab_map["cp"]] if c]
        etab_df = pd.read_csv(io.BytesIO(etab_content), encoding=etab_enc, sep=etab_sep,
                              usecols=etab_usecols, dtype=str, keep_default_na=False)
        total_etab = len(etab_df)

        # Filter by postal code prefix (normalize: remove spaces, uppercase)
        cp_col = etab_map["cp"]
        etab_df["_cp_clean"] = etab_df[cp_col].str.replace(" ", "", regex=False).str.upper()
        prefix_mask = etab_df["_cp_clean"].apply(
            lambda cp: any(cp.startswith(p) for p in ANJOU_POSTAL_PREFIXES)
        )
        anjou_etab = etab_df[prefix_mask].copy()
        del etab_df
        print(f"[REQ-by-postal] {len(anjou_etab)} établissements dans Anjou (sur {total_etab})")

        if anjou_etab.empty:
            return {"status": "ok", "count": 0, "total_scanned": total_etab,
                    "message": f"Aucun établissement trouvé avec code postal {', '.join(ANJOU_POSTAL_PREFIXES)}."}

        # Build NEQ → address from établissements
        neq_col_e = etab_map["neq"]
        addr_l1_col = etab_map["addr_l1"]
        addr_l2_col = etab_map["addr_l2"]
        ville_col = etab_map["ville"]

        neq_to_addr = {}
        for _, row in anjou_etab.iterrows():
            neq = row[neq_col_e].strip()
            if not neq or neq in neq_to_addr:
                continue
            parts = []
            if addr_l1_col:
                v = str(row.get(addr_l1_col, "")).strip()
                if v and v != "0":
                    parts.append(v)
            if addr_l2_col:
                v = str(row.get(addr_l2_col, "")).strip()
                if v and v != "0":
                    parts.append(v)
            addr = ", ".join(parts) if parts else ""
            ville = str(row.get(ville_col, "")).strip() if ville_col else ""
            cp = str(row.get(cp_col, "")).strip()
            ville_cp = " ".join([v for v in [ville, cp] if v and v != "0"])
            if addr or ville_cp:
                neq_to_addr[neq] = {"adresse": addr, "ville_cp": ville_cp}

        anjou_neqs = set(neq_to_addr.keys())

        # ── Read Nom — get company names for these NEQs ──
        nom_content = zf.read(nom_file)
        nom_enc, nom_sep = _detect_encoding_and_sep(nom_content)
        nom_header = pd.read_csv(io.BytesIO(nom_content), encoding=nom_enc, sep=nom_sep, nrows=0)
        nom_cols = list(nom_header.columns)
        nom_map = {k: _find_col(nom_cols, v) for k, v in NOM_COL_MAP.items()}

        nom_usecols = [c for c in [nom_map["neq"], nom_map["nom"]] if c]
        nom_df = pd.read_csv(io.BytesIO(nom_content), encoding=nom_enc, sep=nom_sep,
                             usecols=nom_usecols, dtype=str, keep_default_na=False)
        neq_col_n = nom_map["neq"]
        nom_col = nom_map["nom"]
        nom_df[neq_col_n] = nom_df[neq_col_n].str.strip()

        neq_to_name = {}
        for neq, group in nom_df[nom_df[neq_col_n].isin(anjou_neqs)].groupby(neq_col_n):
            neq_to_name[neq] = group[nom_col].iloc[0].strip()
        del nom_df

        # ── Read Entreprise — get statut for these NEQs ──
        ent_content = zf.read(ent_file)
        ent_enc, ent_sep = _detect_encoding_and_sep(ent_content)
        ent_header = pd.read_csv(io.BytesIO(ent_content), encoding=ent_enc, sep=ent_sep, nrows=0)
        ent_cols = list(ent_header.columns)
        ent_map = {k: _find_col(ent_cols, v) for k, v in ENT_COL_MAP.items()}

        ent_usecols = [c for c in [ent_map["neq"], ent_map["statut"]] if c]
        ent_df = pd.read_csv(io.BytesIO(ent_content), encoding=ent_enc, sep=ent_sep,
                             usecols=ent_usecols, dtype=str, keep_default_na=False)
        neq_col_ent = ent_map["neq"]
        ent_df[neq_col_ent] = ent_df[neq_col_ent].str.strip()

        neq_to_statut = {}
        stat_col = ent_map["statut"]
        for _, row in ent_df[ent_df[neq_col_ent].isin(anjou_neqs)].iterrows():
            neq = row[neq_col_ent]
            if neq not in neq_to_statut and stat_col:
                code = str(row.get(stat_col, "")).strip().upper()
                neq_to_statut[neq] = STATUT_CODE_MAP.get(code, code)
        del ent_df

        # ── Build result rows ──
        raw_rows = []
        for neq in anjou_neqs:
            nom = neq_to_name.get(neq, "")
            if not nom:
                continue
            addr_info = neq_to_addr.get(neq, {"adresse": "", "ville_cp": ""})
            addr = addr_info["adresse"]
            ville_cp = addr_info["ville_cp"]
            statut = neq_to_statut.get(neq, "")

            # Skip radiées
            if "radi" in statut.lower():
                continue

            zone, rue = assign_zone_and_rue(addr)
            raw_rows.append({
                "neq": neq,
                "nom": nom,
                "statut_immat": statut,
                "adresse": addr,
                "ville_cp": ville_cp,
                "zone": zone,
                "rue": rue,
                "segment": "Industriel / Commercial",
            })

        # ── Fuzzy dedupe against existing prospects AND base_clients ──
        db = get_db()
        existing_prospects = (db.table("prospects").select("adresse").execute()).data or []
        prospect_addrs = [str(p.get("adresse", "")).strip() for p in existing_prospects if p.get("adresse")]

        client_addrs = []
        try:
            clients = (db.table("base_clients").select("adresse").execute()).data or []
            client_addrs = [str(c.get("adresse", "")).strip() for c in clients if c.get("adresse")]
        except Exception:
            pass

        all_existing = prospect_addrs + client_addrs
        DEDUP_THRESHOLD = 85

        deduped = []
        duplicates = []
        for row in raw_rows:
            addr = row["adresse"]
            if not addr:
                deduped.append(row)
                continue
            best = 0.0
            for ea in all_existing:
                s = match_score(addr, ea)
                if s > best:
                    best = s
            if best >= DEDUP_THRESHOLD:
                row["dedup_score"] = round(best, 1)
                duplicates.append(row)
            else:
                deduped.append(row)

        print(f"[REQ-by-postal] {len(deduped)} nouveaux, {len(duplicates)} doublons exclus")

        # ── Group by street for preview ──
        streets = {}
        for row in deduped:
            rue_key = row["rue"] or "non assigné"
            if rue_key not in streets:
                streets[rue_key] = {"rue": rue_key, "zone": row["zone"], "rows": []}
            streets[rue_key]["rows"].append(row)

        street_list = sorted(streets.values(), key=lambda s: s["rue"])

        return {
            "status": "ok",
            "count": len(deduped),
            "duplicates": len(duplicates),
            "total_scanned": total_etab,
            "streets": street_list,
            "postal_prefixes": ANJOU_POSTAL_PREFIXES,
        }

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "traceback": traceback.format_exc()})


@router.post("/req-import-selected")
async def req_import_selected(body: dict):
    """Import selected rows from the preview into prospects."""
    rows = body.get("rows", [])
    if not rows:
        return JSONResponse(status_code=400, content={"error": "Aucune ligne sélectionnée"})

    # Transform to prospect schema and use the existing add endpoint logic
    prospect_rows = []
    for r in rows:
        prospect_rows.append({
            "Entreprise": r.get("nom", ""),
            "NEQ": r.get("neq", ""),
            "Adresse": r.get("adresse", ""),
            "Ville_CodePostal": r.get("ville_cp", ""),
            "Segment": r.get("segment", "Industriel / Commercial"),
            "Notes": f"REQ import — {r.get('statut_immat', '')}",
        })

    # Reuse the add_prospects logic via internal call
    db = get_db()
    new_rows = prospect_rows
    existing = (db.table("prospects").select("*").execute()).data or []

    def dedup_key(p):
        addr = str(p.get("Adresse", "") or p.get("adresse", "")).lower().strip()
        nb = str(p.get("Nb_Unites", "") or p.get("nb_unites", "")).strip()
        notes = str(p.get("Notes", "") or p.get("notes", "")).lower().strip()
        return f"{addr}|{nb}|{notes}"

    existing_keys = {dedup_key(p) for p in existing}
    to_insert = []
    for row in new_rows:
        key = dedup_key(row)
        if key in existing_keys:
            continue
        addr = str(row.get("Adresse", "") or "")
        zone, rue = assign_zone_and_rue(addr)
        to_insert.append({
            "entreprise": row.get("Entreprise", "") or row.get("Nom_Syndicat", ""),
            "contact": row.get("Nom_Gestionnaire", "") or row.get("Contact", ""),
            "telephone": row.get("Téléphone", "") or "",
            "statut": "À contacter / À appeler",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "notes": str(row.get("Notes", "") or ""),
            "adresse": addr,
            "ville": str(row.get("Ville_CodePostal", "") or ""),
            "nb_unites": str(row.get("Nb_Unites", "") or ""),
            "secteur": str(row.get("Secteur", "") or ""),
            "segment": str(row.get("Segment", "") or ""),
            "next_action": "",
            "contacte": False,
            "date_contact": "",
            "zone": zone,
            "rue": rue,
            "updated_at": datetime.now().isoformat(),
        })
        existing_keys.add(key)

    if to_insert:
        db.table("prospects").insert(to_insert).execute()
        try:
            db.table("activity_log").insert({
                "action": "req_postal_import",
                "detail": f"{len(to_insert)} entreprises importées (REQ par code postal)",
                "detail_count": len(to_insert),
            }).execute()
        except Exception:
            pass

    total = len(existing) + len(to_insert)
    return {"status": "ok", "added": len(to_insert), "total": total}
