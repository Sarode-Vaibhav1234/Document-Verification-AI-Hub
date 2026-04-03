"""
ml_service/modules/comparator.py
RapidFuzz + spaCy field comparison engine.
Replaces the Gemini "arbitrator" prompt.

Key capabilities:
- Fuzzy string matching tolerates minor spelling errors
- Token-sort ratio handles reordered name tokens
- Multilingual key mapping for Marathi/Hindi field labels
"""

import re
from rapidfuzz import fuzz, process
from typing import Tuple

# ─── Marathi/Hindi field name aliases ─────────────────────────
# This maps common Marathi/Hindi form labels to master data keys
FIELD_ALIASES: dict[str, list[str]] = {
    'name':         ['name', 'नाव', 'नाम', 'full name', 'candidate name', 'applicant name'],
    'fatherName':   ["father's name", 'पित्याचे नाव', 'पिता का नाम', 'father name'],
    'motherName':   ["mother's name", 'आईचे नाव', 'माता का नाम', 'mother name'],
    'dob':          ['dob', 'date of birth', 'जन्म तारीख', 'जन्मतिथि', 'birth date'],
    'gender':       ['gender', 'लिंग', 'sex'],
    'address':      ['address', 'पत्ता', 'पता'],
    'aadharNumber': ['aadhaar no', 'aadhaar number', 'aadhar no', 'आधार क्रमांक', 'uid'],
    'panNumber':    ['pan', 'pan no', 'pan number', 'permanent account number'],
    'casteName':    ['caste', 'जात', 'जाति', 'caste name'],
    'seatNo':       ['seat no', 'seat number', 'आसन क्रमांक'],
    'boardName':    ['board', 'divisional board', 'board name'],
    'percentage':   ['percentage', '%', 'टक्केवारी'],
    'district':     ['district', 'जिल्हा', 'जिला'],
    'state':        ['state', 'राज्य'],
    'serialNo':     ['serial no', 'serial number', 'sr no'],
    'issueDate':    ['issue date', 'date of issue', 'जारी तारीख'],
}

# Reverse alias map: alias → master key
_ALIAS_MAP: dict[str, str] = {}
for master_key, aliases in FIELD_ALIASES.items():
    for alias in aliases:
        _ALIAS_MAP[alias.lower().strip()] = master_key


def _normalize(text: str) -> str:
    """Lowercase, strip, collapse whitespace."""
    return re.sub(r'\s+', ' ', str(text).lower().strip())


def _find_master_key(hw_label: str) -> str | None:
    """Map a handwritten form label to a master data key via alias table."""
    normalized = _normalize(hw_label)
    # Direct lookup
    if normalized in _ALIAS_MAP:
        return _ALIAS_MAP[normalized]
    # Fuzzy lookup (threshold 70%)
    choices = list(_ALIAS_MAP.keys())
    best    = process.extractOne(normalized, choices, scorer=fuzz.token_sort_ratio)
    if best and best[1] >= 70:
        return _ALIAS_MAP[best[0]]
    return None


def _similarity_score(master_val: str, hw_val: str) -> float:
    """Calculate fuzzy similarity 0.0–1.0 between two field values."""
    if not master_val or not hw_val:
        return 0.0
    a = _normalize(master_val)
    b = _normalize(hw_val)
    # token_sort_ratio handles reordered names ("Ravi Kumar" vs "Kumar Ravi")
    score = fuzz.token_sort_ratio(a, b)
    return round(score / 100.0, 4)


def compare_documents(
    master_data: dict,
    handwritten_text: str | dict
) -> Tuple[list[dict], float]:
    """
    Compare master data fields against handwritten form entries.

    Args:
        master_data:      Dict of { field_key: value } from official documents
        handwritten_text: Either:
          - str: raw TrOCR output (we parse key: value lines)
          - dict: pre-parsed {label: value} pairs

    Returns:
        (results_list, overall_similarity)
    """
    # ── Parse handwritten text if it's a raw string ──────────
    if isinstance(handwritten_text, str):
        hw_dict = _parse_kv_text(handwritten_text)
    else:
        hw_dict = handwritten_text  # already parsed

    # ── Build reverse lookup: master_key → hw_value ──────────
    hw_by_master_key: dict[str, str] = {}
    for hw_label, hw_val in hw_dict.items():
        master_key = _find_master_key(hw_label)
        if master_key and master_key not in hw_by_master_key:
            hw_by_master_key[master_key] = hw_val

    # ── Compare each master field ─────────────────────────────
    results = []
    total_sim, count = 0.0, 0

    for field_key, master_val in master_data.items():
        if not master_val or master_val in ('', 'N/A'):
            continue

        hw_val     = hw_by_master_key.get(field_key, 'Not Found')
        similarity = _similarity_score(master_val, hw_val) if hw_val != 'Not Found' else 0.0

        results.append({
            'field':            field_key,
            'masterValue':      master_val,
            'handwrittenValue': hw_val,
            'similarity':       similarity,
        })
        total_sim += similarity
        count     += 1

    overall = round(total_sim / count, 4) if count > 0 else 0.0
    return results, overall


def _parse_kv_text(text: str) -> dict[str, str]:
    """
    Parse raw OCR text into key-value pairs.
    Handles lines like "Name: Rahul Kumar" or "जन्म तारीख - 01/01/2000".
    """
    kv = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Try colon or dash separator
        for sep in [':', '-', '–']:
            if sep in line:
                parts = line.split(sep, 1)
                if len(parts) == 2:
                    key, val = parts[0].strip(), parts[1].strip()
                    if key and val:
                        kv[key] = val
                        break
    return kv
