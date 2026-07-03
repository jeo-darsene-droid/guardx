import re
from unidecode import unidecode


def normalize_address(addr: str) -> str:
    """Normalize an address string for fuzzy comparison."""
    if not isinstance(addr, str):
        return ""
    addr = addr.lower().strip()
    addr = addr.replace("saint-", "st-").replace("saint ", "st ")
    addr = addr.replace("sainte-", "ste-").replace("sainte ", "ste ")
    addr = addr.replace("boulevard", "boul").replace("avenue", "av")
    addr = re.sub(r"[-\s]+", " ", addr)
    addr = unidecode(addr)
    return addr.strip()
