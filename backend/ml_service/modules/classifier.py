"""
ml_service/modules/classifier.py
Local document classifier using YOLOv8 (Ultralytics).
Replaces the Roboflow cloud API.

To use:
1. Train a YOLOv8 model on your Aadhaar/PAN dataset.
2. Save the model as ml_service/models/aadhaar_detector.pt
3. OR download a pretrained one and put it in models/

Returns Roboflow-compatible JSON so server.js proxy is transparent.
"""

import io
import numpy as np
from PIL import Image

# Lazy-loaded models
_models = {}

MODEL_PATHS = {
    'aadhaar': 'ml_service/models/aadhaar_detector.pt',
    'pan':     'ml_service/models/pan_detector.pt',
}

# Required elements per doc type (must match your trained class names)
REQUIRED_ELEMENTS = {
    'aadhaar': ['photo', 'logo', 'aadhar no', 'qr'],
    'pan':     ['photo', 'pan', 'symbol'],
}


def _load_model(doc_type: str):
    if doc_type not in _models:
        model_path = MODEL_PATHS.get(doc_type)
        if not model_path:
            raise ValueError(f"No model defined for doc_type: {doc_type}")

        import os
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Model file not found: {model_path}\n"
                f"Train a YOLOv8 model and save it there, or set ML_SERVICE_URL empty "
                f"to fall back to Roboflow."
            )

        from ultralytics import YOLO
        print(f"⏳ Loading YOLOv8 model for {doc_type}…")
        _models[doc_type] = YOLO(model_path)
        print(f"✅ Loaded {doc_type} detector.")
    return _models[doc_type]


def classify_document(image_bytes: bytes, doc_type: str) -> dict:
    """
    Run YOLOv8 detection on the image and return Roboflow-format JSON.
    Server.js expects: { predictions: [{ class, confidence, x, y, width, height }] }
    """
    model = _load_model(doc_type)

    pil   = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img   = np.array(pil)

    results = model(img, verbose=False)
    predictions = []

    for box in results[0].boxes:
        cls_idx    = int(box.cls[0])
        cls_name   = results[0].names[cls_idx]
        confidence = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()

        predictions.append({
            'class':      cls_name,
            'confidence': confidence,
            'x':          (x1 + x2) / 2,
            'y':          (y1 + y2) / 2,
            'width':      x2 - x1,
            'height':     y2 - y1,
        })

    return {'predictions': predictions, 'image': {'width': img.shape[1], 'height': img.shape[0]}}
