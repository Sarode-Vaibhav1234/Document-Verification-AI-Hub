# 🧠 Document AI Hub

> An AI-powered document verification and analysis platform built with Node.js, Google Gemini, and browser-native ML — processing everything locally or via secure server-side APIs.

![Version](https://img.shields.io/badge/version-2.1-blue)
![Modules](https://img.shields.io/badge/modules-6-green)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

---

## 📌 Overview

**Document AI Hub** is a full-stack web application that provides six AI-powered modules for verifying and analysing identity documents, handwritten forms, and images. It combines Google Gemini (cloud OCR), Roboflow (document classification), and TensorFlow.js (in-browser face recognition) to create a comprehensive document intelligence platform.

All sensitive operations run server-side; **face recognition and ELA forensics run 100% in the browser** — no biometric data is ever sent to a server.

---

## 🗂️ Project Structure

```
Document-and-Form-verification-using-AI/
│
├── frontend/                        # Static UI (served by Express)
│   ├── index.html                   # Home page — module selection hub
│   ├── home-style.css               # Global design system for home page
│   ├── style.css                    # Shared styles for OCR & form pages
│   │
│   ├── gemini-ocr.html              # AI Document OCR module
│   ├── script.js                    # OCR page logic
│   │
│   ├── form.html                    # Auto-filled verification form
│   ├── form.js                      # Form auto-fill & validation logic
│   │
│   ├── offline-validator.html       # Handwritten Form Validator
│   ├── offline-validator.js         # Field-by-field comparison logic
│   │
│   ├── aadhaar-verifier.html        # Aadhaar Bulk Verifier
│   ├── aadhaar-verifier.css
│   ├── aadhaar-verifier.js
│   │
│   ├── pan-verifier.html            # PAN Card Bulk Verifier
│   ├── pan-verifier.css
│   ├── pan-verifier.js
│   │
│   ├── forgery-detector.html        # Document Forgery Detector
│   ├── forgery-detector.css
│   ├── forgery-detector.js
│   │
│   ├── face-match.html              # Face Match KYC Verifier
│   ├── face-match.css
│   └── face-match.js
│
├── backend/                         # Node.js Express server
│   ├── server.js                    # Main server — all API routes
│   ├── package.json
│   ├── package-lock.json
│   ├── .env                         # ← NOT committed (secrets)
│   ├── verifications.db             # ← NOT committed (SQLite, auto-created)
│   └── ml_service/                  # Python FastAPI ML microservice (optional)
│       ├── main.py
│       ├── requirements.txt
│       ├── models/                  # ← NOT committed (large weight files)
│       └── modules/
│
├── .gitignore
└── README.md
```

---

## 🚀 Modules

| # | Module | Technology | Where it runs |
|---|--------|-----------|---------------|
| 1 | **AI Document OCR** | Google Gemini 2.5 Flash | Server-side |
| 2 | **Aadhaar Card Verifier** | Roboflow Object Detection | Server-side |
| 3 | **PAN Card Verifier** | Roboflow Object Detection | Server-side |
| 4 | **Handwritten Form Validator** | Levenshtein similarity + session | Server-side |
| 5 | **Document Forgery Detector** | ELA (canvas) + EXIF (exifr) | Browser + Server |
| 6 | **Face Match KYC** | face-api.js / TensorFlow.js | 100% Browser |

### 1. 📄 AI Document OCR
Upload Aadhaar, PAN, marksheets, or certificates. Google Gemini Vision extracts structured key fields (name, DOB, document numbers, address, scores) and stores them in the session for use by downstream modules.

### 2. 🪪 Aadhaar Card Bulk Verifier
Upload multiple images in one batch. A Roboflow YOLO model detects the presence of Aadhaar-specific elements (photo, logo, Aadhaar number, QR code). Verified cards can be downloaded as a `.zip` archive.

### 3. 💳 PAN Card Bulk Verifier
Same batch pipeline as Aadhaar, but trained for PAN cards (photo, PAN number text region, government symbol). Exports verified images as a `.zip`.

### 4. ✍️ Handwritten Form Validator
Upload a scanned handwritten registration form. Gemini OCR extracts all fields and compares them field-by-field against the master data extracted in Module 1. Color-coded match/mismatch table is shown.

### 5. 🔍 Document Forgery Detector
Runs two parallel analyses:
- **ELA (Error Level Analysis)** — re-compresses the image at JPEG 75% quality in-browser using Canvas API and visualises pixel-level differences as a heatmap colour-coded from blue (normal) → red (tampered).
- **EXIF Metadata Forensics** — server-side `exifr` library extracts full metadata; the server flags anomalies (editing software fingerprints, GPS data, date mismatches) and assigns a **Risk Score 0–100%**.

### 6. 🤳 Face Match KYC
Compares the photo on an ID document against a selfie or live webcam capture. Uses Microsoft's ResNet-based `face-api.js` with 128-point facial embeddings and Euclidean distance similarity — all running in-browser using TensorFlow.js. No face data is sent to any server.

---

## ⚙️ Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| Vanilla HTML5 / CSS3 | Structure & design |
| Vanilla JavaScript (ES2022) | All module logic |
| [face-api.js](https://github.com/justadudewhohacks/face-api.js) | Browser face recognition |
| [JSZip](https://stuk.github.io/jszip/) | Client-side ZIP creation |
| Canvas API | ELA heatmap rendering |

### Backend
| Technology | Purpose |
|-----------|---------|
| [Node.js](https://nodejs.org) + [Express](https://expressjs.com) | HTTP server & API routing |
| [Google Gemini 2.5 Flash](https://ai.google.dev/) | Document OCR & field extraction |
| [Roboflow](https://roboflow.com) | Document classification (Aadhaar/PAN) |
| [exifr](https://github.com/MikeKovarik/exifr) | EXIF/metadata forensics |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Local verification history |
| [multer](https://github.com/expressjs/multer) | File upload handling |
| [helmet](https://helmetjs.github.io/) | HTTP security headers |
| [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) | API rate limiting |

---

## 🔧 Setup & Installation

### Prerequisites
- [Node.js](https://nodejs.org) v18+
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)
- A [Roboflow API Key](https://roboflow.com) (for Aadhaar/PAN classifiers)

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/Document-and-Form-verification-using-AI.git
cd Document-and-Form-verification-using-AI
```

### 2. Install backend dependencies
```bash
cd backend
npm install
```

### 3. Configure environment variables
Create a `.env` file inside `backend/`:
```bash
cp backend/.env.example backend/.env   # if example exists, else create manually
```

```env
# backend/.env

# Google Gemini API (required for OCR)
GEMINI_API_KEY=your_gemini_api_key_here

# Roboflow API (required for Aadhaar/PAN verifier)
ROBOFLOW_API_KEY=your_roboflow_api_key_here

# Express session secret (use a long random string)
SESSION_SECRET=your_very_long_random_secret_here

# Optional: Python ML microservice URL
ML_SERVICE_URL=

# Node environment
NODE_ENV=development
PORT=3000
```

### 4. Start the server
```bash
cd backend
npm start
```

Open your browser at: **http://localhost:3000**

---

## 🔐 Security Features

- **Helmet.js** — Sets 12 HTTP security headers automatically
- **Rate Limiting** — 120 requests / 15 min per IP on all AI endpoints
- **File Validation** — MIME type + size enforcement (max 5 MB, JPEG/PNG/WebP only)
- **Session Isolation** — Data stored per-user session, not globally
- **No Biometrics Uploaded** — Face matching runs entirely in the browser
- **`.env` excluded** — Secrets never enter version control

---

## 🧪 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/analyze-document` | OCR extraction via Gemini |
| `POST` | `/validate-handwritten-form` | Handwritten form field comparison |
| `POST` | `/classify-document?type=aadhaar` | Aadhaar card classification via Roboflow |
| `POST` | `/classify-document?type=pan` | PAN card classification via Roboflow |
| `POST` | `/analyze-metadata` | EXIF / metadata forensics |
| `GET`  | `/` | Serves `frontend/index.html` |

---

## 🗄️ Database

A SQLite database (`backend/verifications.db`) is auto-created on first run with two tables:

- **`verifications`** — Stores OCR results (session_id, doc_type, extracted_data, timestamp)
- **`handwritten_checks`** — Stores form validation results (similarity score, comparison JSON, verdict)

The database file is excluded from git via `.gitignore`.

---

## 🐍 ML Service (Optional)

A Python FastAPI microservice lives in `backend/ml_service/` for local model inference. It is optional — the system falls back to cloud APIs if `ML_SERVICE_URL` is not set.

```bash
cd backend/ml_service
pip install -r requirements.txt
python main.py
```

Set `ML_SERVICE_URL=http://localhost:8000` in your `.env` to enable it.

> **Note:** ML model weights (`.pt`, `.onnx`, `.bin`) are excluded from git due to file size. Download them separately.

---

## 📁 What's Excluded from Git

| Path | Reason |
|------|--------|
| `backend/.env` | Contains API keys & secrets |
| `backend/node_modules/` | Installed via `npm install` |
| `backend/verifications.db` | Runtime database (auto-created) |
| `backend/ml_service/venv/` | Python virtual environment |
| `backend/ml_service/models/*.pt` | Large binary model weights |
| `*.log` | Runtime log files |

---

## 📸 Screenshots

> Home page with 6 module cards, dark mode UI

| Module | Description |
|--------|-------------|
| Home | Dark-mode module grid with hover animations |
| OCR | Upload & extract fields from any ID document |
| Aadhaar Verifier | Batch upload with ZIP download |
| Forgery Detector | ELA heatmap + EXIF anomaly report |
| Face Match | Live webcam face comparison |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-module`
3. Commit your changes: `git commit -m 'Add new module'`
4. Push: `git push origin feature/new-module`
5. Open a Pull Request

---

## 📄 License

ISC License — see [LICENSE](LICENSE) for details.

---

## 🏫 About

Developed at **Walchand College of Engineering (WCE)** as part of a document verification research project.

> **Stack:** Node.js · Express · Google Gemini · Roboflow · face-api.js · TensorFlow.js · SQLite · Vanilla JS
