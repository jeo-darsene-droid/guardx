"""Vérification Phase E — REQ businesses-by-street import."""
import io
import json
import os
import zipfile
import urllib.request
from datetime import datetime

BASE = "http://localhost:8000/api"
ok, fail = 0, 0

def check(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1; print(f"  [OK]   {label}")
    else:
        fail += 1; print(f"  [FAIL] {label} {detail}")

def post(path, body=None, is_form=False, file_data=None):
    if file_data:
        boundary = "----TestBoundary12345"
        parts = []
        for key, (filename, content) in file_data.items():
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"; filename=\"{filename}\"\r\n\r\n".encode())
            parts.append(content)
            parts.append(f"\r\n--{boundary}--\r\n".encode())
        data = b"".join(parts)
        req = urllib.request.Request(f"{BASE}{path}", data=data,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, method="POST")
    else:
        data = json.dumps(body or {}).encode()
        req = urllib.request.Request(f"{BASE}{path}", data=data,
            headers={"Content-Type": "application/json"}, method="POST")
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def get(path):
    return json.loads(urllib.request.urlopen(f"{BASE}{path}").read())

# ── Create a minimal REQ ZIP for testing ──
def make_test_zip():
    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, "w")

    # Etablissement.csv — 5 rows, 3 in Anjou (H1J/H1K), 2 outside
    etab_csv = (
        "NEQ,LIGN1_ADR,LIGN2_ADR,LIGN3_ADR,LIGN4_ADR\n"
        "1111111,1000 rue Edison,,Montréal,H1J 1A1\n"
        "1111112,1002 rue Edison,,Montréal,H1J 2B2\n"
        "1111113,2000 boul Métropolitain Est,,Montréal,H1K 3C3\n"
        "2222222,999 rue Sherbrooke,,Montréal,H2X 1Y1\n"
        "2222223,500 rue Sainte-Catherine,,Montréal,H3A 1Z1\n"
    )
    zf.writestr("Etablissement.csv", etab_csv)

    # Nom.csv — names for all NEQs
    nom_csv = (
        "NEQ,NOM_ASSUJ,TYP_NOM_ASSUJ\n"
        "1111111,Les Industries Edison Inc.,P\n"
        "1111112,Edison Solutions Ltée,P\n"
        "1111113,Métro Logistique SARL,P\n"
        "2222222,Sherbrooke Holdings Inc.,P\n"
        "2222223,Catherine Commerce Ltée,P\n"
    )
    zf.writestr("Nom.csv", nom_csv)

    # Entreprise.csv — statut for all NEQs
    ent_csv = (
        "NEQ,COD_STAT_IMMAT,COD_FORME_JURI\n"
        "1111111,IM,1000\n"
        "1111112,IM,1000\n"
        "1111113,IM,1000\n"
        "2222222,IM,1000\n"
        "2222223,RD,1000\n"
    )
    zf.writestr("Entreprise.csv", ent_csv)

    zf.close()
    return buf.getvalue()

print("=== Pre-cleanup: remove any leftover test prospects ===")
existing = get("/prospects")
cleanup_keywords = ["Edison", "Métro Logistique", "Industries Edison", "Syndicat Test", "D-Test", "Test Anjou"]
cleaned = [p for p in existing if not any(x.lower() in str(p.get("entreprise", "")).lower() for x in cleanup_keywords)]
if len(cleaned) != len(existing):
    post("/prospects", {"prospects": cleaned})
    print(f"  Removed {len(existing) - len(cleaned)} leftover test prospects")

print("=== E1. Endpoint exists and accepts ZIP ===")
zip_data = make_test_zip()
status, data = post("/req-import-by-postal", file_data={"file": ("test_req.zip", zip_data)})
check("Endpoint répond 200", status == 200, f"got {status}: {data}")
check("Status ok", data.get("status") == "ok", f"got {data.get('status')}")
check("3 entreprises Anjou trouvées (H1J/H1K)", data.get("count") == 3, f"got {data.get('count')}")
check("0 doublons (base nettoyée)", data.get("duplicates") == 0, f"got {data.get('duplicates')}")
check("5 établissements scannés", data.get("total_scanned") == 5, f"got {data.get('total_scanned')}")
check("Codes postaux retournés", data.get("postal_prefixes") == ["H1J", "H1K"], f"got {data.get('postal_prefixes')}")

print("\n=== E2. Grouping par rue ===")
streets = data.get("streets", [])
check("Streets retournées", len(streets) > 0, f"got {len(streets)}")
rue_edison = next((s for s in streets if s["rue"] == "edison"), None)
rue_metro = next((s for s in streets if "metropolitain" in s["rue"]), None)
check("Rue 'edison' présente avec 2 entreprises", rue_edison and len(rue_edison["rows"]) == 2,
      f"got {rue_edison}")
check("Rue 'metropolitain est' présente avec 1 entreprise", rue_metro and len(rue_metro["rows"]) == 1,
      f"got {rue_metro}")
check("Rue edison → ZONE 1", rue_edison and "ZONE 1" in rue_edison.get("zone", ""), f"got {rue_edison.get('zone') if rue_edison else 'N/A'}")
check("Rue metropolitain → ZONE 2", rue_metro and "ZONE 2" in rue_metro.get("zone", ""), f"got {rue_metro.get('zone') if rue_metro else 'N/A'}")

print("\n=== E3. Champs par entreprise ===")
if rue_edison:
    r = rue_edison["rows"][0]
    check("Nom présent", bool(r.get("nom")), f"got {r.get('nom')}")
    check("NEQ présent", bool(r.get("neq")), f"got {r.get('neq')}")
    check("Adresse présente", bool(r.get("adresse")), f"got {r.get('adresse')}")
    check("Segment = Industriel / Commercial", r.get("segment") == "Industriel / Commercial", f"got {r.get('segment')}")
    check("Zone assignée", bool(r.get("zone")), f"got {r.get('zone')}")
    check("Rue assignée", bool(r.get("rue")), f"got {r.get('rue')}")
    check("Statut immatriculée", r.get("statut_immat") == "Immatriculée", f"got {r.get('statut_immat')}")

print("\n=== E4. Filtrage radiées ===")
all_rows = [r for s in streets for r in s["rows"]]
neqs = [r["neq"] for r in all_rows]
check("NEQ 2222223 (radiée) exclue", "2222223" not in neqs, f"got {neqs}")
check("NEQ 2222222 (H2X) exclue (hors Anjou)", "2222222" not in neqs, f"got {neqs}")

print("\n=== E5. Import sélection vers prospects ===")
# Select all 3 rows (2 from edison + 1 from metropolitain)
selected = []
if rue_edison:
    selected.extend(rue_edison["rows"])
if rue_metro:
    selected.extend(rue_metro["rows"])
status, import_data = post("/req-import-selected", {"rows": selected})
check("Import répond 200", status == 200, f"got {status}")
check("Import status ok", import_data.get("status") == "ok", f"got {import_data}")
check("3 prospects ajoutés", import_data.get("added") == 3, f"got {import_data.get('added')}")

# Verify in DB
prospects = get("/prospects")
edison_prospects = [p for p in prospects if "edison" in str(p.get("adresse", "")).lower() and str(p.get("entreprise", "")).startswith("Les Industries") or str(p.get("entreprise", "")).startswith("Edison Solutions")]
check("Prospects visibles dans DB", len(edison_prospects) >= 2, f"got {len(edison_prospects)}")
if edison_prospects:
    p = edison_prospects[0]
    check("Zone auto-assignée dans DB", "ZONE 1" in str(p.get("zone", "")), f"got {p.get('zone')}")
    check("Rue auto-assignée dans DB", p.get("rue") == "edison", f"got {p.get('rue')}")
    check("Segment = Industriel / Commercial", p.get("segment") == "Industriel / Commercial", f"got {p.get('segment')}")
    check("Statut initial = À contacter", p.get("statut") == "À contacter / À appeler", f"got {p.get('statut')}")

print("\n=== E6. Dédoublonnage (re-import exclut doublons) ===")
status2, data2 = post("/req-import-by-postal", file_data={"file": ("test_req.zip", zip_data)})
check("Re-import: 0 nouveau (3 déjà dans prospects)", data2.get("count") == 0, f"got {data2.get('count')}")
check("Re-import: 3 doublons exclus", data2.get("duplicates") == 3, f"got {data2.get('duplicates')}")

print("\n=== E7. Re-import → pas de double insertion ===")
# No new rows to import
remaining = []
for s in data2.get("streets", []):
    remaining.extend(s["rows"])
if remaining:
    status3, import_data3 = post("/req-import-selected", {"rows": remaining})
    check("2e import: 0 ajouté (déjà présent)", import_data3.get("added") == 0, f"got {import_data3.get('added')}")
else:
    check("2e import: aucune nouvelle ligne (attendu)", True)

print(f"\n{'='*50}\nRESULTAT: {ok} OK / {fail} ECHEC(S)")

# ── Nettoyage ──
if fail == 0:
    kept = [p for p in get("/prospects") if not any(x.lower() in str(p.get("entreprise", "")).lower() for x in cleanup_keywords)]
    post("/prospects", {"prospects": kept})
    print("Prospects de test nettoyés.")
raise SystemExit(1 if fail else 0)
