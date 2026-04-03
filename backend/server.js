// ============================================================
// server.js — Document Verification System
// Production-hardened: security, validation, SQLite, rate limiting
// ============================================================

const express       = require('express');
const multer        = require('multer');
const axios         = require('axios');
const session       = require('express-session');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const Database      = require('better-sqlite3');
const path          = require('path');
require('dotenv').config();

// ─── Configuration ────────────────────────────────────────────
const app  = express();
const port = process.env.PORT || 3000;
const ENV  = process.env.NODE_ENV || 'development';
const isProd = ENV === 'production';

// ─── Validate required env vars ───────────────────────────────
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
const SESSION_SECRET    = process.env.SESSION_SECRET;
const ROBOFLOW_API_KEY  = process.env.ROBOFLOW_API_KEY;
const ML_SERVICE_URL    = process.env.ML_SERVICE_URL || '';

if (!GEMINI_API_KEY)   { console.error('FATAL: GEMINI_API_KEY missing');   process.exit(1); }
if (!SESSION_SECRET)   { console.error('FATAL: SESSION_SECRET missing');    process.exit(1); }
if (!ROBOFLOW_API_KEY) { console.warn('WARN: ROBOFLOW_API_KEY missing — /classify-document will fail'); }

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ─── SQLite Database ───────────────────────────────────────────
const db = new Database(path.join(__dirname, 'verifications.db'));
db.exec(`
    CREATE TABLE IF NOT EXISTS verifications (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT    NOT NULL,
        doc_type     TEXT    NOT NULL,
        extracted_data TEXT  NOT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS handwritten_checks (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id       TEXT    NOT NULL,
        overall_similarity REAL  NOT NULL,
        comparison_json  TEXT    NOT NULL,
        verdict          TEXT    NOT NULL,
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);
console.log('✅ SQLite database ready (verifications.db)');

// ─── Middleware ────────────────────────────────────────────────
// Security headers (CSP disabled for inline scripts in existing HTML)
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiting — 120 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/analyze-document',        limiter);
app.use('/validate-handwritten-form', limiter);
app.use('/classify-document',       limiter);

// File upload — memory storage with size cap enforced below
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 6 * 1024 * 1024 } // 6 MB hard limit in multer
});

// Session
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure:   isProd,  // HTTPS only in production
        httpOnly: true,
        maxAge:   60 * 60 * 1000 // 1 hour
    }
}));

// Static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/form.html', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'form.html')));

// ─── Helpers ──────────────────────────────────────────────────
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB  = 5;

function validateUpload(file, res) {
    if (!file) {
        res.status(400).json({ error: 'No file uploaded.' });
        return false;
    }
    if (!ALLOWED_MIME.includes(file.mimetype)) {
        res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are allowed.' });
        return false;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        res.status(400).json({ error: `File must be under ${MAX_SIZE_MB}MB.` });
        return false;
    }
    return true;
}

function safeParseJSON(text, context) {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        return { data: JSON.parse(cleaned), error: null };
    } catch (e) {
        console.error(`JSON parse error in ${context}:`, cleaned.slice(0, 200));
        return { data: null, error: 'AI returned malformed response. Please try again.' };
    }
}

function clientError(error, res, status = 500) {
    const msg = isProd ? 'An internal error occurred.' : error.message;
    res.status(status).json({ error: msg });
}

function getPromptForDocType(docType) {
    const base = 'You are an expert data extraction AI. Analyze this government document image. ' +
                 'Return ONLY a valid JSON object — no markdown, no extra text. ' +
                 'Use empty string "" for missing fields. Extract: ';
    const map = {
        aadhar:               "full name → 'name', aadhar number → 'aadharNumber', gender → 'gender', address → 'address', date of birth → 'dob'.",
        pan:                  "full name → 'name', father's name → 'fatherName', PAN number → 'panNumber', date of birth → 'dob'.",
        marksheet_10th:       "student name → 'name', seat number → 'seatNo', mother's name → 'motherName', board name → 'boardName', percentage → 'percentage'.",
        caste_certificate:    "caste name → 'casteName'.",
        domicile_certificate: "district → 'district', serial number → 'serialNo', issue date → 'issueDate', state → 'state', territory → 'territory'.",
    };
    return base + (map[docType] || "name → 'name', dates, and numbers.");
}

// ─── Endpoint 1: Analyze Document (OCR) ───────────────────────
app.post('/analyze-document', upload.single('document'), async (req, res) => {
    const { docType } = req.body;
    if (!validateUpload(req.file, res)) return;
    if (!docType) return res.status(400).json({ error: 'Document type missing.' });

    // Try local ML service first (Phase 3 transition)
    if (ML_SERVICE_URL) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([req.file.buffer]), req.file.originalname);
            formData.append('doc_type', docType);
            const mlResp = await axios.post(`${ML_SERVICE_URL}/ocr`, formData, { timeout: 30000 });
            const data = mlResp.data;
            if (!req.session.documentData) req.session.documentData = {};
            req.session.documentData[docType] = data;
            saveVerification(req.sessionID, docType, data);
            return res.json({ success: true, message: `${docType.replace(/_/g, ' ')} analyzed.`, extractedData: data });
        } catch (mlErr) {
            console.warn('ML service unavailable, falling back to Gemini:', mlErr.message);
        }
    }

    try {
        const imageBase64 = req.file.buffer.toString('base64');
        const prompt      = getPromptForDocType(docType);
        const reqData     = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: req.file.mimetype, data: imageBase64 } }] }] };

        const apiResp   = await axios.post(GEMINI_URL, reqData, { timeout: 30000 });
        const rawText   = apiResp.data.candidates[0].content.parts[0].text;
        const { data, error } = safeParseJSON(rawText, '/analyze-document');
        if (error) return res.status(500).json({ error });

        if (!req.session.documentData) req.session.documentData = {};
        req.session.documentData[docType] = data;
        saveVerification(req.sessionID, docType, data);

        res.json({ success: true, message: `${docType.replace(/_/g, ' ')} uploaded successfully.`, extractedData: data });

    } catch (err) {
        console.error('Error in /analyze-document:', err.response?.data || err.message);
        clientError(err, res);
    }
});

function saveVerification(sessionId, docType, data) {
    try {
        db.prepare('INSERT INTO verifications (session_id, doc_type, extracted_data) VALUES (?, ?, ?)')
          .run(sessionId, docType, JSON.stringify(data));
    } catch (e) {
        console.error('DB save error:', e.message);
    }
}

// ─── Endpoint 2: Get Session Data ─────────────────────────────
app.get('/get-session-data', (req, res) => {
    if (req.session.documentData) {
        res.json({ success: true, data: req.session.documentData });
    } else {
        res.json({ success: false, message: 'No document data found in session.' });
    }
});

// ─── Endpoint 3: Submit Form ───────────────────────────────────
app.post('/submit-form', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ success: false, message: 'Could not log out.' });
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Form submitted and session cleared.' });
    });
});

// ─── Endpoint 4: Validate Handwritten Form ─────────────────────
app.post('/validate-handwritten-form', upload.single('handwrittenForm'), async (req, res) => {
    if (!req.session.documentData) {
        return res.status(400).json({ error: 'No master document data in session. Please upload original documents first.' });
    }
    if (!validateUpload(req.file, res)) return;

    // Try local ML HTR + comparator first
    if (ML_SERVICE_URL) {
        try {
            const masterData = Object.values(req.session.documentData).reduce((a, c) => ({ ...a, ...c }), {});
            const fd = new FormData();
            fd.append('file', new Blob([req.file.buffer]), req.file.originalname);
            fd.append('master_data', JSON.stringify(masterData));
            const mlResp = await axios.post(`${ML_SERVICE_URL}/compare`, fd, { timeout: 45000 });
            return res.json(mlResp.data);
        } catch (mlErr) {
            console.warn('ML service unavailable, falling back to Gemini:', mlErr.message);
        }
    }

    try {
        const imageBase64 = req.file.buffer.toString('base64');

        // Step A: HTR OCR on handwritten form
        const ocrPrompt = 'This is a filled form (English or Marathi). Extract all handwritten entries with their printed labels. ' +
                          'Return ONLY a flat JSON object: { "label": "handwritten_value", ... }';
        const ocrReqData   = { contents: [{ parts: [{ text: ocrPrompt }, { inline_data: { mime_type: req.file.mimetype, data: imageBase64 } }] }] };
        const ocrApiResp   = await axios.post(GEMINI_URL, ocrReqData, { timeout: 30000 });
        const ocrRawText   = ocrApiResp.data.candidates[0].content.parts[0].text;
        const { data: handwrittenData, error: ocrErr } = safeParseJSON(ocrRawText, 'HTR-OCR');
        if (ocrErr) return res.status(500).json({ error: ocrErr });

        // Step B: Semantic comparison
        const masterData = Object.values(req.session.documentData).reduce((a, c) => ({ ...a, ...c }), {});
        const arbPrompt  = `You are a data validation expert. Compare these two JSON objects:
1. masterData (source of truth): ${JSON.stringify(masterData)}
2. handwrittenData (from handwritten form, labels may differ or be in Marathi): ${JSON.stringify(handwrittenData)}

For each field in masterData, find the matching field in handwrittenData (even if label is in another language).
Calculate similarity 0.0–1.0 (1.0 = exact match, accounting for minor spelling errors).

Return ONLY a JSON array: [{"field":"key","masterValue":"val","handwrittenValue":"val","similarity":0.95}, ...]
If no match found: set handwrittenValue to "Not Found" and similarity to 0.0.`;

        const arbReqData  = { contents: [{ parts: [{ text: arbPrompt }] }] };
        const arbApiResp  = await axios.post(GEMINI_URL, arbReqData, { timeout: 30000 });
        const arbRawText  = arbApiResp.data.candidates[0].content.parts[0].text;
        const { data: comparisonResults, error: arbErr } = safeParseJSON(arbRawText, 'arbitrator');
        if (arbErr) return res.status(500).json({ error: arbErr });

        // Compute overall similarity
        let totalSim = 0, count = 0;
        comparisonResults.forEach(item => {
            if (item.masterValue && item.masterValue !== '' && item.masterValue !== 'N/A') {
                totalSim += item.similarity;
                count++;
            }
        });
        const overallSimilarity = count > 0 ? totalSim / count : 0;
        const verdict = overallSimilarity >= 0.90 ? 'PASS' : 'FAIL';

        // Persist result
        try {
            db.prepare('INSERT INTO handwritten_checks (session_id, overall_similarity, comparison_json, verdict) VALUES (?, ?, ?, ?)')
              .run(req.sessionID, overallSimilarity, JSON.stringify(comparisonResults), verdict);
        } catch (dbErr) {
            console.error('DB save error (handwritten_checks):', dbErr.message);
        }

        res.json({ comparison: comparisonResults, overallSimilarity, verdict });

    } catch (err) {
        console.error('Error in /validate-handwritten-form:', err.response?.data || err.message);
        clientError(err, res);
    }
});

// ─── Endpoint 5: Document Classifier Proxy (replaces frontend Roboflow call) ───
app.post('/classify-document', upload.single('image'), async (req, res) => {
    const docType = req.query.type; // 'aadhaar' or 'pan'
    if (!validateUpload(req.file, res)) return;
    if (!docType) return res.status(400).json({ error: 'Missing ?type= parameter.' });

    // Try local ML classifier first
    if (ML_SERVICE_URL) {
        try {
            const fd = new FormData();
            fd.append('file', new Blob([req.file.buffer]), req.file.originalname);
            fd.append('doc_type', docType);
            const mlResp = await axios.post(`${ML_SERVICE_URL}/classify`, fd, { timeout: 30000 });
            return res.json(mlResp.data);
        } catch (mlErr) {
            console.warn('ML classifier unavailable, falling back to Roboflow:', mlErr.message);
        }
    }

    if (!ROBOFLOW_API_KEY) {
        return res.status(503).json({ error: 'Classification service not configured. Add ROBOFLOW_API_KEY to .env' });
    }

    const modelMap = {
        aadhaar: 'https://serverless.roboflow.com/document-verification-rbdur/3',
        pan:     'https://serverless.roboflow.com/pancard-mp1jt/1',
    };
    const endpoint = modelMap[docType];
    if (!endpoint) return res.status(400).json({ error: `Unknown doc type: ${docType}` });

    try {
        const base64Body = req.file.buffer.toString('base64');
        const url        = new URL(endpoint);
        url.searchParams.set('api_key', ROBOFLOW_API_KEY);

        const rfResp = await axios.post(url.toString(), base64Body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 20000
        });
        res.json(rfResp.data);
    } catch (err) {
        console.error('Roboflow proxy error:', err.response?.data || err.message);
        clientError(err, res);
    }
});

// ─── Endpoint 6: Document Metadata Analysis (Forgery Detection) ───
app.use('/analyze-metadata', limiter);
app.post('/analyze-metadata', upload.single('document'), async (req, res) => {
    if (!validateUpload(req.file, res)) return;

    try {
        const exifr  = require('exifr');
        const rawExif = await exifr.parse(req.file.buffer, {
            tiff: true, xmp: true, icc: false, iptc: true, jfif: true,
        }).catch(() => null);

        const exif = rawExif || {};
        const anomalies = [];

        // ── Check for photo-editing software ─────────────────
        const editingApps = ['photoshop', 'gimp', 'paint.net', 'lightroom', 'snapseed',
                             'picsart', 'pixelmator', 'affinity', 'canva', 'inkscape'];
        if (exif.Software) {
            const sw = exif.Software.toLowerCase();
            const found = editingApps.find(a => sw.includes(a));
            if (found) {
                anomalies.push({
                    severity: 'CRITICAL',
                    field: 'Software',
                    value: exif.Software,
                    message: `Image was edited with photo-editing software: ${exif.Software}`
                });
            }
        }

        // ── GPS coordinates (unusual for scanned documents) ──
        if (exif.latitude !== undefined && exif.longitude !== undefined) {
            anomalies.push({
                severity: 'MEDIUM',
                field: 'GPS Location',
                value: `${Number(exif.latitude).toFixed(5)}, ${Number(exif.longitude).toFixed(5)}`,
                message: 'GPS coordinates embedded — uncommon for scanned/photographed government documents'
            });
        }

        // ── File modified after creation ──────────────────────
        const origDate = exif.DateTimeOriginal || exif.DateTimeDigitized || exif.CreateDate;
        const modDate  = exif.DateTime || exif.ModifyDate;
        if (origDate && modDate) {
            const diffMs = new Date(modDate) - new Date(origDate);
            const diffDays = Math.round(diffMs / 86400000);
            if (diffDays > 1) {
                anomalies.push({
                    severity: 'LOW',
                    field: 'Modification Date',
                    value: new Date(modDate).toLocaleDateString('en-IN'),
                    message: `File was modified ${diffDays} day(s) after original creation`
                });
            }
        }

        // ── Very small file — may be a screenshot ─────────────
        const fileSizeKB = req.file.size / 1024;
        if (fileSizeKB < 30) {
            anomalies.push({
                severity: 'LOW',
                field: 'File Size',
                value: `${fileSizeKB.toFixed(1)} KB`,
                message: 'Very small file — may be a heavily compressed screenshot or thumbnail'
            });
        }

        // ── Persist scan to DB ────────────────────────────────
        try {
            db.prepare(`CREATE TABLE IF NOT EXISTS forgery_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT, mimetype TEXT, size INTEGER,
                anomaly_count INTEGER, critical_count INTEGER,
                has_exif INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`).run();

            db.prepare('INSERT INTO forgery_checks (filename, mimetype, size, anomaly_count, critical_count, has_exif) VALUES (?,?,?,?,?,?)')
              .run(req.file.originalname, req.file.mimetype, req.file.size,
                   anomalies.length,
                   anomalies.filter(a => a.severity === 'CRITICAL').length,
                   Object.keys(exif).length > 0 ? 1 : 0);
        } catch (_) { /* non-critical */ }

        res.json({
            exif,
            hasExif:       Object.keys(exif).length > 0,
            fileInfo:      { name: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype },
            anomalies,
            anomalyCount:  anomalies.length,
            criticalCount: anomalies.filter(a => a.severity === 'CRITICAL').length,
        });

    } catch (err) {
        console.error('Metadata analysis error:', err.message);
        res.json({
            exif: {}, hasExif: false,
            fileInfo: { name: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype },
            anomalies: [], anomalyCount: 0, criticalCount: 0,
            parseError: 'Could not parse metadata from this file.'
        });
    }
});

// ─── Start Server ──────────────────────────────────────────────
app.listen(port, () => {
    console.log(`\n🚀 Server running at http://localhost:${port}`);
    console.log(`📦 Environment: ${ENV}`);
    console.log(`🔐 Roboflow API: ${ROBOFLOW_API_KEY ? 'Configured (server-side)' : '⚠️  Missing'}`);
    console.log(`🤖 ML Service:   ${ML_SERVICE_URL  ? ML_SERVICE_URL : 'Not configured (using cloud APIs)'}\n`);
    console.log(`🔍 New Modules:  Forgery Detector (/forgery-detector.html) | Face Match (/face-match.html)\n`);
});
