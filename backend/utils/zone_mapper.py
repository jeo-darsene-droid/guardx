"""Zone mapper for Anjou territory system.

Normalizes the street name from a full address and assigns a zone
based on a user-editable JSON config file.
"""
import json
import os
import re
from unidecode import unidecode

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "config", "zone_mapping.json")

_zone_cache = None


def _load_zones():
    """Load and cache the zone mapping from JSON config."""
    global _zone_cache
    if _zone_cache is None:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            _zone_cache = json.load(f)
    return _zone_cache


def reload_zones():
    """Force reload of the zone mapping (after config edit)."""
    global _zone_cache
    _zone_cache = None
    return _load_zones()


def extract_street(address: str) -> str:
    """Extract the street name from a full address string.

    Examples:
        "244 rue Saint-Raphaël"          → "saint-raphaël"
        "9700 boul Métropolitain Est"    → "metropolitain est"
        "5255 rue Jean-Talon Est"        → "jean-talon est"
        "123 Galeries d'Anjou"           → "galeries d'anjou"
    """
    if not address or not isinstance(address, str):
        return ""
    s = address.strip()
    # Remove leading civic number (digits, possibly with a range like 97-99)
    s = re.sub(r"^\d+[-–]?\d*\s*", "", s)
    # Remove common street type prefixes
    s = re.sub(r"^(rue|boulevard|boul|avenue|av|chemin|ch|place|pl|route|rte|autoroute|aut|impasse|imp|allée|allee|prom|promenade)\s+", "", s, flags=re.IGNORECASE)
    # Normalize: lowercase, unidecode, collapse spaces/hyphens
    s = s.lower().strip()
    s = unidecode(s)
    s = re.sub(r"[-\s]+", " ", s).strip()
    return s


def assign_zone(address: str) -> str:
    """Return the zone label for a given address, or 'Hors zone' if no match.

    Matching is done on the normalized street name extracted from the address.
    The zone config values are also normalized for comparison.
    """
    street = extract_street(address)
    if not street:
        return "Hors zone"

    zones = _load_zones()
    for zone_label, streets in zones.items():
        for config_street in streets:
            config_norm = unidecode(config_street.lower().strip())
            config_norm = re.sub(r"[-\s']+", " ", config_norm).strip()
            street_cmp = re.sub(r"[']+", " ", street)
            street_cmp = re.sub(r"\s+", " ", street_cmp).strip()
            # Exact match, prefix match, or word-boundary containment
            # (handles particles: "du grenache" matches "grenache")
            if (street_cmp == config_norm
                    or street_cmp.startswith(config_norm + " ")
                    or re.search(r"(^|\s)" + re.escape(config_norm) + r"($|\s)", street_cmp)):
                return zone_label
    return "Hors zone"


def assign_zone_and_rue(address: str):
    """Return (zone, rue) for a given address."""
    rue = extract_street(address)
    zone = assign_zone(address)
    return zone, rue
