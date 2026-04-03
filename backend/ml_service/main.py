# ============================================================
# ml_service/main.py — Local Python ML Service (FastAPI)
# Replaces all cloud APIs with local models.
# ============================================================

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import json

from modules.preprocessor import preprocess_image_bytes
from modules.ocr_engine    import extract_fields_tesseract
from modules.htr_engine    import recognize_handwritten
from modules.classifier    import classify_document
from modules.comparator    import compare_documents

# ─── Startup / Shutdown ────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load all models at startup so they are warm for requests."""
    print("🚀 ML Service starting — loading models...")
    # Models are loaded lazily inside each module on first call,
    # but we import here to trigger any validation.
    yield
    print("🔴 ML Service shutting down.")

app = FastAPI(
    title="Document AI — Local ML Service",
    description="Fully local OCR, HTR, classification and comparison pipeline.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

# ─── Health Check ──────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "Document AI ML Service v1.0"}

# ─── /ocr ——————————————————————————————————————————————————————
@app.post("/ocr")
async def ocr_endpoint(
    file:     UploadFile = File(...),
    doc_type: str        = Form(...)
):
    """
    Printed text OCR using Tesseract + OpenCV preprocessing.
    Replaces Gemini /analyze-document.
    """
    image_bytes = await file.read()
    try:
        img    = preprocess_image_bytes(image_bytes)
        fields = extract_fields_tesseract(img, doc_type)
        return fields
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── /htr ──────────────────────────────────────────────────────
@app.post("/htr")
async def htr_endpoint(file: UploadFile = File(...)):
    """
    Handwritten Text Recognition using TrOCR (local HuggingFace model).
    Replaces Gemini HTR call in /validate-handwritten-form.
    """
    image_bytes = await file.read()
    try:
        img  = preprocess_image_bytes(image_bytes)
        text = recognize_handwritten(img)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── /classify ─────────────────────────────────────────────────
@app.post("/classify")
async def classify_endpoint(
    file:     UploadFile = File(...),
    doc_type: str        = Form(...)
):
    """
    Document classification using local YOLOv8 / EfficientNet model.
    Replaces Roboflow /classify-document proxy.
    """
    image_bytes = await file.read()
    try:
        result = classify_document(image_bytes, doc_type)
        # Return in the same format as Roboflow so server.js proxy is transparent
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── /compare ──────────────────────────────────────────────────
@app.post("/compare")
async def compare_endpoint(
    file:        UploadFile = File(...),
    master_data: str        = Form(...)   # JSON string
):
    """
    Full handwritten form validation pipeline:
    1. Preprocess image
    2. TrOCR → extract handwritten field values
    3. RapidFuzz + spaCy → compare against master data
    Replaces both Gemini calls in /validate-handwritten-form.
    """
    image_bytes = await file.read()
    try:
        master = json.loads(master_data)
        img    = preprocess_image_bytes(image_bytes)

        # Step 1: Extract handwritten fields from the form image
        hw_text = recognize_handwritten(img)  # raw text; could also use segment+OCR approach

        # Step 2: Compare
        results, overall = compare_documents(master, hw_text)

        verdict = "PASS" if overall >= 0.90 else "FAIL"
        return {
            "comparison":        results,
            "overallSimilarity": overall,
            "verdict":           verdict,
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="master_data must be valid JSON")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Run ───────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
