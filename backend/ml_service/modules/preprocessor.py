"""
ml_service/modules/preprocessor.py
OpenCV + Pillow image preprocessing pipeline.
Deskew → Denoise → Contrast enhancement → Binarization
"""

import io
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import cv2


def preprocess_image_bytes(image_bytes: bytes) -> np.ndarray:
    """Convert raw bytes → preprocessed OpenCV numpy array."""
    pil_img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img      = np.array(pil_img)
    img      = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

    img = _resize(img, max_dim=2048)
    img = _deskew(img)
    img = _denoise(img)
    img = _enhance_contrast(img)
    return img


def _resize(img: np.ndarray, max_dim: int = 2048) -> np.ndarray:
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img   = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _deskew(img: np.ndarray) -> np.ndarray:
    """Correct document skew using Hough line transform."""
    gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges  = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines  = cv2.HoughLines(edges, 1, np.pi / 180, threshold=100)
    if lines is None:
        return img
    angles = [l[0][1] for l in lines if abs(l[0][1] - np.pi / 2) < np.pi / 8]
    if not angles:
        return img
    angle  = np.mean(angles) - np.pi / 2
    angle_deg = np.degrees(angle)
    # Only correct small skew (avoid over-rotating)
    if abs(angle_deg) > 10:
        return img
    h, w   = img.shape[:2]
    M      = cv2.getRotationMatrix2D((w / 2, h / 2), angle_deg, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def _denoise(img: np.ndarray) -> np.ndarray:
    return cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)


def _enhance_contrast(img: np.ndarray) -> np.ndarray:
    """CLAHE contrast enhancement on luminance channel."""
    lab   = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l     = clahe.apply(l)
    lab   = cv2.merge([l, a, b])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def to_pil(img: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


def to_grayscale_pil(img: np.ndarray) -> Image.Image:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return Image.fromarray(gray)
