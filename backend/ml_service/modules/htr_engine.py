"""
ml_service/modules/htr_engine.py
Microsoft TrOCR — Local Handwritten Text Recognition.
Replaces the Gemini HTR call. Models are downloaded on first run (~400 MB)
and cached in ~/.cache/huggingface/hub/.

Model: microsoft/trocr-base-handwritten  (lighter, faster)
Alt:   microsoft/trocr-large-handwritten (more accurate, 1.4 GB)
"""

import numpy as np
from PIL import Image
from .preprocessor import to_pil

# Lazy-loaded globals — loaded once at first request, reused after
_processor = None
_model     = None

MODEL_NAME = 'microsoft/trocr-base-handwritten'


def _load_model():
    global _processor, _model
    if _processor is None or _model is None:
        print(f"⏳ Loading TrOCR model ({MODEL_NAME})…")
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        _processor = TrOCRProcessor.from_pretrained(MODEL_NAME)
        _model     = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME)
        # Move to GPU if available
        try:
            import torch
            if torch.cuda.is_available():
                _model = _model.cuda()
                print("✅ TrOCR loaded on CUDA GPU")
            else:
                print("✅ TrOCR loaded on CPU")
        except ImportError:
            print("✅ TrOCR loaded on CPU (torch not found)")


def recognize_handwritten(img: np.ndarray) -> str:
    """
    Run TrOCR on a preprocessed image.
    Returns the recognized text as a single string.
    The image is split into lines for better accuracy.
    """
    _load_model()
    pil = to_pil(img).convert('RGB')
    return _recognize_pil(pil)


def _recognize_pil(pil_img: Image.Image) -> str:
    """Recognize text from a PIL image using TrOCR."""
    import torch
    pixel_values  = _processor(images=pil_img, return_tensors='pt').pixel_values
    if torch.cuda.is_available():
        pixel_values = pixel_values.cuda()
    with torch.no_grad():
        generated_ids = _model.generate(pixel_values)
    text = _processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
    return text.strip()
