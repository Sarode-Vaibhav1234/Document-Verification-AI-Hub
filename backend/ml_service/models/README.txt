This directory holds trained model weight files (.pt / .pth / .onnx).

These files are excluded from Git (.gitignore) because they are large binary files.

To use the local ML service, you need to provide:
  - aadhaar_detector.pt  — YOLOv8 model trained to detect Aadhaar card elements
  - pan_detector.pt      — YOLOv8 model trained to detect PAN card elements

TrOCR models are downloaded automatically from HuggingFace on first run
and cached in `~/.cache/huggingface/hub/`.

Training instructions: see document_verification_analysis.md §4 (Model Training Roadmap)
