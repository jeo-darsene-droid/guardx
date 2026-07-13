"""Vérification complète Phase A — Système de territoire Anjou."""
import sys
import os
import urllib.request
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.zone_mapper import assign_zone_and_rue, extract_street, _load_zones

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

print("=== 1. Config des zones ===")
zones = _load_zones()
check("4 zones definies", len(zones) == 4, f"trouve {len(zones)}")
total_streets = sum(len(v) for v in zones.values())
check("29 rues au total", total_streets == 29, f"trouve {total_streets}")

print("\n=== 2. Extraction de rue ===")
cases_extract = [
    ("244 rue Saint-Raphael", "saint raphael"),
    ("9700 boul Metropolitain Est", "metropolitain est"),
    ("97-99 rue Chaumont", "chaumont"),
    ("5255 avenue Jean-Talon Est", "jean talon est"),
    ("", ""),
    (None, ""),
]
for addr, expected in cases_extract:
    got = extract_street(addr)
    check(f"extract_street({addr!r}) == {expected!r}", got == expected, f"got {got!r}")

print("\n=== 3. Attribution de zone (toutes les rues du mapping) ===")
zone_tests = [
    ("123 rue Jarry Est", "ZONE 1"), ("45 rue Bombardier", "ZONE 1"),
    ("10 rue Ray-Lawson", "ZONE 1"), ("22 rue Ampere", "ZONE 1"),
    ("33 rue Edison", "ZONE 1"), ("44 rue Galilee", "ZONE 1"),
    ("55 rue Newton", "ZONE 1"), ("66 rue Colbert", "ZONE 1"),
    ("77 boul Pascal-Gagnon", "ZONE 1"), ("88 rue du Grenache", "ZONE 1"),
    ("9700 boul Metropolitain Est", "ZONE 2"), ("1 aut Louis-H-La Fontaine", "ZONE 2"),
    ("7999 Galeries-d'Anjou", "ZONE 2"), ("5255 rue Jean-Talon Est", "ZONE 2"),
    ("6000 rue Saint-Zotique Est", "ZONE 2"),
    ("7890 boul Henri-Bourassa Est", "ZONE 3"), ("100 rue Langelier", "ZONE 3"),
    ("10 rue de la Seine", "ZONE 3"), ("20 rue de l'Yser", "ZONE 3"),
    ("30 rue de la Marne", "ZONE 3"),
    ("100 rue Chaumont", "ZONE 4"), ("200 rue Joseph-Renaud", "ZONE 4"),
    ("300 boul Wilfrid-Pelletier", "ZONE 4"), ("400 rue de l'Anjou", "ZONE 4"),
    ("500 rue des Ormeaux", "ZONE 4"), ("600 rue Chateauneuf", "ZONE 4"),
    ("700 rue Goncourt", "ZONE 4"), ("800 rue Grosbois", "ZONE 4"),
    ("900 rue de Grenoble", "ZONE 4"),
    ("999 rue Inconnue", "Hors zone"),
]
for addr, expected_prefix in zone_tests:
    zone, rue = assign_zone_and_rue(addr)
    check(f"{addr} -> {expected_prefix}", zone.startswith(expected_prefix),
          f"got {zone!r} (rue={rue!r})")

print("\n=== 4. Endpoints API ===")
r = post("/zone/reload")
check("POST /zone/reload", r.get("status") == "ok" and len(r.get("zones", [])) == 4)
r = post("/zone/backfill")
check("POST /zone/backfill", r.get("status") == "ok")

print("\n=== 5. Colonnes DB + prospect test ===")
prospects = get("/prospects")
if prospects:
    p = prospects[-1]
    check("colonne 'zone' presente", "zone" in p)
    check("colonne 'rue' presente", "rue" in p)
    check("prospect test a une zone", bool(p.get("zone")), f"zone={p.get('zone')!r}")
else:
    print("  [WARN] table prospects vide, colonnes verifiees via API precedente")

print(f"\n{'='*50}\nRESULTAT: {ok} OK / {fail} ECHEC(S)")
sys.exit(1 if fail else 0)
