"""Vérification E2E Phase D — données réelles pour le street tracker."""
import urllib.request
import json
from datetime import datetime

BASE = "http://localhost:8000/api"
ok, fail = 0, 0

def check(label, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  [OK]   {label}")
    else:
        fail += 1
        print(f"  [FAIL] {label} {detail}")

def post(path, body=None):
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(f"{BASE}{path}", data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())

def get(path):
    return json.loads(urllib.request.urlopen(urllib.request.Request(f"{BASE}{path}")).read())

today = datetime.now().date().isoformat()

# ── Setup : 3 prospects sur 2 rues de zones différentes ──
print("=== Setup ===")
post("/prospects/add", {"prospects": [
    {"Entreprise": "D-Test Edison A", "Adresse": "1000 rue Edison", "Ville_CodePostal": "Anjou", "Segment": "Industriel / Commercial"},
    {"Entreprise": "D-Test Edison B", "Adresse": "1002 rue Edison", "Ville_CodePostal": "Anjou", "Segment": "Industriel / Commercial"},
    {"Entreprise": "D-Test Goncourt", "Adresse": "2000 rue Goncourt", "Ville_CodePostal": "Anjou", "Segment": "Syndicat de copropriété"},
]})
prospects = get("/prospects")
tests = [p for p in prospects if str(p.get("entreprise", "")).startswith("D-Test")]
check("3 prospects de test créés", len(tests) == 3, f"got {len(tests)}")

p_ed_a = next((p for p in tests if p["adresse"] == "1000 rue Edison"), None)
p_ed_b = next((p for p in tests if p["adresse"] == "1002 rue Edison"), None)
p_gc = next((p for p in tests if p["adresse"] == "2000 rue Goncourt"), None)

print("\n=== D-E2E-1. Champs zone/rue pour le regroupement ===")
check("Edison A → zone = ZONE 1", str(p_ed_a.get("zone", "")).startswith("ZONE 1"), f"got {p_ed_a.get('zone')}")
check("Edison A → rue = edison", p_ed_a.get("rue") == "edison", f"got {p_ed_a.get('rue')}")
check("Edison B → même rue (edison)", p_ed_b.get("rue") == "edison")
check("Goncourt → zone = ZONE 4", str(p_gc.get("zone", "")).startswith("ZONE 4"), f"got {p_gc.get('zone')}")
check("Goncourt → rue = goncourt", p_gc.get("rue") == "goncourt", f"got {p_gc.get('rue')}")

print("\n=== D-E2E-2. Notes de traçabilité (nouveau backend D1) ===")
# visite_absent doit ajouter une note "Visite absent [date]"
post("/prospects/quick-action", {"prospect_id": p_ed_a["id"], "action": "visite_absent"})
p = next(p for p in get("/prospects") if p["id"] == p_ed_a["id"])
check(f"visite_absent → note 'Visite absent {today}'", f"Visite absent {today}" in (p.get("notes") or ""), f"got {p.get('notes')!r}")
check("visite_absent → statut 'À repasser' (compte 'à repasser' du tracker)", p.get("statut") == "À repasser")

# retour_entrant doit ajouter une note "Retour entrant [date]"
post("/prospects/quick-action", {"prospect_id": p_ed_b["id"], "action": "retour_entrant"})
p = next(p for p in get("/prospects") if p["id"] == p_ed_b["id"])
check(f"retour_entrant → note 'Retour entrant {today}'", f"Retour entrant {today}" in (p.get("notes") or ""), f"got {p.get('notes')!r}")

# Notes cumulées (append, pas écrasées)
post("/prospects/quick-action", {"prospect_id": p_ed_b["id"], "action": "visite_absent"})
p = next(p for p in get("/prospects") if p["id"] == p_ed_b["id"])
notes = p.get("notes") or ""
check("Notes cumulées : retour + visite conservés", "Retour entrant" in notes and "Visite absent" in notes, f"got {notes!r}")

print("\n=== D-E2E-3. Simulation du regroupement street tracker ===")
# Réplique du grouping frontend sur données réelles
all_p = [p for p in get("/prospects") if str(p.get("entreprise", "")).startswith("D-Test")]
zones = {}
for p in all_p:
    z = p.get("zone") or "Hors zone"
    r = p.get("rue") or "Non assigné"
    zones.setdefault(z, {}).setdefault(r, []).append(p)
z1_key = next((k for k in zones if k.startswith("ZONE 1")), None)
z4_key = next((k for k in zones if k.startswith("ZONE 4")), None)
check("Regroupement : ZONE 1 contient rue edison avec 2 prospects",
      z1_key and len(zones[z1_key].get("edison", [])) == 2)
check("Regroupement : ZONE 4 contient rue goncourt avec 1 prospect",
      z4_key and len(zones[z4_key].get("goncourt", [])) == 1)

# Compte "à repasser" par rue (badge du tracker)
edison_pros = zones[z1_key]["edison"]
repasser = sum(1 for p in edison_pros if p.get("statut") == "À repasser")
retours = sum(1 for p in edison_pros if "retour entrant" in (p.get("notes") or "").lower())
visites = sum(1 for p in edison_pros if "visite" in (p.get("notes") or "").lower() or p.get("statut") == "À repasser")
check("Rue edison : 2 à repasser", repasser == 2, f"got {repasser}")
check("Rue edison : 1 retour entrant", retours == 1, f"got {retours}")
check("Rue edison : 2 visites", visites == 2, f"got {visites}")

print(f"\n{'='*50}\nRESULTAT: {ok} OK / {fail} ECHEC(S)")

# ── Nettoyage ──
if fail == 0:
    kept = [p for p in get("/prospects") if not str(p.get("entreprise", "")).startswith("D-Test")]
    post("/prospects", {"prospects": kept})
    print("Prospects de test supprimés.")
raise SystemExit(1 if fail else 0)
