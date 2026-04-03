"""
ml_service/modules/ocr_engine.py
Pytesseract OCR for printed document text extraction.
Replaces Gemini Vision API for printed OCR.
"""

import re
import pytesseract
import numpy as np
from .preprocessor import to_pil, to_grayscale_pil

# On Windows, set path to Tesseract binary if needed:
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Language config: English + Hindi + Marathi
LANG_CONFIG = 'eng+hin+mar'


def _ocr_raw(img: np.ndarray) -> str:
    pil = to_pil(img)
    return pytesseract.image_to_string(pil, lang=LANG_CONFIG, config='--oem 3 --psm 6')


def extract_fields_tesseract(img: np.ndarray, doc_type: str) -> dict:
    """
    Extract structured fields from a preprocessed document image.
    Returns the same JSON schema expected by server.js.
    """
    raw = _ocr_raw(img)

    extractors = {
        'aadhar':               _extract_aadhaar,
        'pan':                  _extract_pan,
        'marksheet_10th':       _extract_marksheet,
        'caste_certificate':    _extract_caste,
        'domicile_certificate': _extract_domicile,
    }
    extractor = extractors.get(doc_type, _extract_generic)
    return extractor(raw)


# ─── Field-specific extractors ──────────────────────────────────

def _extract_aadhaar(text: str) -> dict:
    uid   = re.search(r'\b(\d{4}\s\d{4}\s\d{4})\b', text)
    dob   = re.search(r'\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b', text)
    name  = _extract_name_line(text, before_keyword=['DOB', 'Date of Birth', 'Year of Birth', 'जन्म'])
    gender = _extract_gender(text)
    address = _extract_address_block(text)
    return {
        'name':         name,
        'aadharNumber': uid.group(1) if uid else '',
        'dob':          dob.group(1) if dob else '',
        'gender':       gender,
        'address':      address,
    }


def _extract_pan(text: str) -> dict:
    pan   = re.search(r'\b([A-Z]{5}\d{4}[A-Z])\b', text)
    dob   = re.search(r'\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b', text)
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    # PAN card: line after "Name" label is the name
    name  = _extract_label_value(text, ['Name', 'नाम'])
    father = _extract_label_value(text, ["Father's Name", "FATHER'S NAME", "पिता का नाम"])
    return {
        'name':       name,
        'fatherName': father,
        'panNumber':  pan.group(1) if pan else '',
        'dob':        dob.group(1) if dob else '',
    }


def _extract_marksheet(text: str) -> dict:
    seat  = re.search(r'Seat\s*(?:No|Number)[.:]\s*(\S+)', text, re.IGNORECASE)
    pct   = re.search(r'(\d{1,3}(?:\.\d{1,2})?)\s*%', text)
    name  = _extract_label_value(text, ["Student's Name", "Name", "Candidate Name"])
    mother = _extract_label_value(text, ["Mother's Name", "Mother Name"])
    board  = _extract_label_value(text, ["Board", "Division", "Divisional Board"])
    return {
        'name':       name,
        'seatNo':     seat.group(1) if seat else '',
        'motherName': mother,
        'boardName':  board,
        'percentage': pct.group(1) if pct else '',
    }


def _extract_caste(text: str) -> dict:
    caste = _extract_label_value(text, ['Caste', 'जाति', 'Caste Name'])
    return {'casteName': caste}


def _extract_domicile(text: str) -> dict:
    serial  = re.search(r'(?:Serial|Sr|No)[.\s#:]*([A-Z0-9/\-]+)', text, re.IGNORECASE)
    date    = re.search(r'\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b', text)
    district = _extract_label_value(text, ['District', 'जिला'])
    state    = _extract_label_value(text, ['State', 'राज्य'])
    territory = _extract_label_value(text, ['Territory', 'क्षेत्र'])
    return {
        'district':  district,
        'serialNo':  serial.group(1) if serial else '',
        'issueDate': date.group(1) if date else '',
        'state':     state,
        'territory': territory,
    }


def _extract_generic(text: str) -> dict:
    dob  = re.search(r'\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b', text)
    nums = re.findall(r'\b\d{4,}\b', text)
    return {'name': '', 'dob': dob.group(1) if dob else '', 'numbers': ' '.join(nums[:5])}


# ─── Helper utilities ──────────────────────────────────────────

def _extract_label_value(text: str, labels: list[str]) -> str:
    for label in labels:
        m = re.search(rf'{re.escape(label)}\s*[:\-]?\s*(.+)', text, re.IGNORECASE)
        if m:
            return m.group(1).strip().split('\n')[0].strip()
    return ''


def _extract_name_line(text: str, before_keyword: list[str]) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for i, line in enumerate(lines):
        for kw in before_keyword:
            if kw.lower() in line.lower() and i > 0:
                candidate = lines[i - 1]
                if re.match(r'^[A-Za-z\s\.]+$', candidate):
                    return candidate
    return ''


def _extract_gender(text: str) -> str:
    text_lower = text.lower()
    if 'female' in text_lower or 'महिला' in text_lower or 'स्त्री' in text_lower:
        return 'Female'
    if 'male' in text_lower or 'पुरुष' in text_lower:
        return 'Male'
    return ''


def _extract_address_block(text: str) -> str:
    m = re.search(r'Address[:\s]+(.+?)(?=\n\n|\Z)', text, re.IGNORECASE | re.DOTALL)
    if m:
        return ' '.join(m.group(1).split())
    return ''
