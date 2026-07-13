"""Extract civic number and street tokens from syndicat names for address matching.

Syndicat names often embed the building address, e.g.:
  "SYNDICAT DE LA COPROPRIÉTÉ 97-99 DUHAMEL"
  "SYNDICAT DES COPROPRIÉTAIRES DU 8500 AVENUE DES GALERIES"
  "SYNDICAT DE COPROPRIÉTÉ LES JARDINS D'ANJOU"  (no address → returns None)

LEGAL RULE: This module NEVER extracts or infers person names.
Only civic numbers and street tokens are extracted from company names.
"""

import re
from unidecode import unidecode


def extract_address_from_name(nom: str):
    """Extract civic number(s) and street tokens from a syndicat name.

    Returns dict with:
        civic: str  — e.g. "97-99" or "8500" or ""
        street: str — e.g. "duhamel" or "avenue des galeries" or ""
        raw: str    — the matched address fragment, or "" if none found
    Returns None if no address-like pattern found.
    """
    if not isinstance(nom, str) or not nom.strip():
        return None

    text = unidecode(nom).strip()

    # Pattern 1: civic number (with optional range) followed by street name
    # Matches: "97-99 DUHAMEL", "8500 AVENUE DES GALERIES", "1234 RUE ST-DENIS"
    # The civic number can be a range (97-99) or single number.
    # Street name = everything after the number up to end or a stopword.
    pattern = r'(\d{1,5}(?:\s*[-–]\s*\d{1,5})?)\s+([A-Z][A-Z0-9\s\'\-\.]+?)\s*(?:$|\.|,|;|SYNDICAT|COPROPRI)'
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        civic = m.group(1).replace(' ', '').replace('–', '-')
        street = m.group(2).strip().rstrip('.,;')
        # Filter out obvious non-street matches (e.g. "LES JARDINS D'ANJOU" has no number)
        # If the number is part of a date or other context, skip
        # But if we found a number followed by uppercase text, it's likely an address
        if len(street) >= 3:
            return {
                'civic': civic,
                'street': street.lower().strip(),
                'raw': f"{civic} {street}".strip(),
            }

    # Pattern 2: "DU <number> <street>" — e.g. "DU 8500 AVENUE DES GALERIES"
    pattern2 = r'(?:DU|DE LA|DES|DE)\s+(\d{1,5}(?:\s*[-–]\s*\d{1,5})?)\s+([A-Z][A-Z0-9\s\'\-\.]+?)\s*(?:$|\.|,|;|SYNDICAT|COPROPRI)'
    m2 = re.search(pattern2, text, re.IGNORECASE)
    if m2:
        civic = m2.group(1).replace(' ', '').replace('–', '-')
        street = m2.group(2).strip().rstrip('.,;')
        if len(street) >= 3:
            return {
                'civic': civic,
                'street': street.lower().strip(),
                'raw': f"{civic} {street}".strip(),
            }

    return None


def score_extracted(extracted: dict, building_norm: str) -> float:
    """Score a precomputed name extraction against a pre-normalized building address.

    Use this in loops: extract once per syndicat, normalize once per building.
    Returns 0-100 score. 0 means no match.
    """
    if not extracted or not building_norm:
        return 0.0

    from utils.address_normalizer import normalize_address

    civic = extracted['civic']
    street = extracted['street']

    # Check civic number match
    # Building address civic might be "97" while name has "97-99"
    # or building has "97" and name has "97-99" → match if building civic is in range
    civic_match = False
    if civic and civic in building_norm:
        civic_match = True
    elif '-' in civic:
        # Range: check if building civic falls within
        try:
            parts = civic.split('-')
            lo, hi = int(parts[0]), int(parts[1])
            # Extract civic number from building address
            b_civic_m = re.search(r'(\d{1,5})', building_norm)
            if b_civic_m:
                b_civic = int(b_civic_m.group(1))
                if lo <= b_civic <= hi:
                    civic_match = True
        except (ValueError, IndexError):
            pass

    # Check street token match (cache normalization in the extracted dict)
    street_norm = extracted.get('street_norm')
    if street_norm is None:
        street_norm = normalize_address(street)
        extracted['street_norm'] = street_norm
    street_match = False
    if street_norm and street_norm in building_norm:
        street_match = True
    elif street_norm:
        # Partial match: check if key street tokens appear in building address
        street_tokens = [t for t in street_norm.split() if len(t) > 2]
        if street_tokens:
            matched_tokens = sum(1 for t in street_tokens if t in building_norm)
            if matched_tokens / len(street_tokens) >= 0.5:
                street_match = True

    if civic_match and street_match:
        return 100.0
    elif civic_match:
        return 70.0
    elif street_match:
        return 60.0
    else:
        return 0.0


def name_address_score(nom_normalise: str, building_address: str) -> float:
    """Score how well a syndicat name's embedded address matches a building address.

    Convenience wrapper — for loops, use extract_address_from_name + score_extracted
    to avoid redundant work.
    Returns 0-100 score. 0 means no address in name or no match.
    """
    extracted = extract_address_from_name(nom_normalise)
    if not extracted:
        return 0.0

    from utils.address_normalizer import normalize_address
    building_norm = normalize_address(building_address)
    return score_extracted(extracted, building_norm)


# ── Unit tests (run directly: python -m utils.req_matcher) ──

if __name__ == "__main__":
    print("=== Unit tests: extract_address_from_name ===\n")

    tests = [
        ("SYNDICAT DE LA COPROPRIÉTÉ 97-99 DUHAMEL",
         {"civic": "97-99", "street": "duhamel"}),
        ("SYNDICAT DES COPROPRIÉTAIRES DU 8500 AVENUE DES GALERIES",
         {"civic": "8500", "street": "avenue des galeries"}),
        ("SYNDICAT DE COPROPRIÉTÉ LES JARDINS D'ANJOU",
         None),
        ("SYNDICAT DE LA COPROPRIÉTÉ 1234 RUE ST-DENIS",
         {"civic": "1234", "street": "rue st-denis"}),
        ("SYNDICAT DES COPROPRIÉTAIRES DU 500-502 BOULEVARD ROSEMENT",
         {"civic": "500-502", "street": "boulevard rosement"}),
    ]

    all_pass = True
    for nom, expected in tests:
        result = extract_address_from_name(nom)
        if expected is None:
            passed = result is None
            status = "PASS" if passed else "FAIL"
            if not passed:
                all_pass = False
            print(f"  [{status}] {nom}")
            if not passed:
                print(f"         Expected: None, Got: {result}")
        else:
            passed = (result is not None and
                      result['civic'] == expected['civic'] and
                      expected['street'] in result['street'])
            status = "PASS" if passed else "FAIL"
            if not passed:
                all_pass = False
            print(f"  [{status}] {nom}")
            if not passed:
                print(f"         Expected: {expected}")
                print(f"         Got: {result}")

    print(f"\n{'All tests passed!' if all_pass else 'Some tests FAILED!'}")
