from typing import Optional, Tuple, List
from rapidfuzz import fuzz
from .address_normalizer import normalize_address


def match_score(addr1: str, addr2: str) -> float:
    """Return a 0-100 fuzzy match score between two addresses."""
    n1 = normalize_address(addr1)
    n2 = normalize_address(addr2)
    if not n1 or not n2:
        return 0.0
    return fuzz.token_sort_ratio(n1, n2)


def find_best_match(addr: str, client_addresses: List[str]) -> Tuple[Optional[str], float]:
    """Find the best matching client address for a prospect address."""
    best_score = 0.0
    best_match = None
    for ca in client_addresses:
        score = match_score(addr, ca)
        if score > best_score:
            best_score = score
            best_match = ca
    return best_match, best_score
