// Import necessary packages
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const session = require('express-session');
// Note: Levenshtein is no longer needed as Gemini will handle the similarity logic.
require('dotenv').config();

// --- Configuration ---
const app = express();
const port = 3000;
const upload = multer({ storage: multer.memoryStorage() });
const SESSION_SECRET = process.env.SESSION_SECRET;

// --- Single API Key Setup ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not defined in .env file.");
    process.exit(1);
}
// The API URL is defined once and used for all requests.
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;


// --- Session Middleware Setup ---
if (!SESSION_SECRET) {
    console.error("FATAL ERROR: SESSION_SECRET is not defined in .env file.");
    process.exit(1);
}
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, 
        httpOnly: true, 
        maxAge: 60 * 60 * 1000 
    }
}));

// --- Serve Frontend Files ---
app.use(express.static('public')); 
app.get('/form.html', (req, res) => {
    res.sendFile(__dirname + '/public/form.html');
});

// --- Prompt Generation Logic ---
function getPromptForDocType(docType) {
    const basePrompt = "You are an expert data extraction AI. Analyze this image of a government document. " +
                       "Return the data ONLY in a valid JSON object format. Do not include any other text or markdown formatting. " +
                       "If a field is not found, use an empty string '' as the value. Extract the following fields with these exact JSON keys: ";
    
    let fields = '';
    switch (docType) {
        case 'aadhar':
            fields = "full name as 'name', aadhar number as 'aadharNumber', gender as 'gender', address as 'address', and date of birth as 'dob'.";
            break;
        case 'pan':
            fields = "full name as 'name', father's name as 'fatherName', Permanent Account Number (PAN) as 'panNumber', and date of birth as 'dob'.";
            break;
        case 'marksheet_10th':
            fields = "student's name as 'name', seat number as 'seatNo', mother's name as 'motherName', divisional board name as 'boardName', and percentage as 'percentage'.";
            break;
        case 'caste_certificate':
            fields = "caste name as 'casteName'.";
            break;
        case 'domicile_certificate':
            fields = "district name as 'district', serial number as 'serialNo', issue date as 'issueDate', state as 'state', and territory as 'territory'.";
            break;
        default:
            fields = "any visible name as 'name', numbers, and dates.";
    }
    return basePrompt + fields;
}

// --- API Endpoint 1: Analyze Document and Save to Session ---
app.post('/analyze-document', upload.single('document'), async (req, res) => {
    const docType = req.body.docType;
    if (!req.file || !docType) {
        return res.status(400).json({ error: 'File or document type missing.' });
    }

    if (!req.session.documentData) {
        req.session.documentData = {};
    }

    try {
        const imageBase64 = req.file.buffer.toString('base64');
        const prompt = getPromptForDocType(docType);
        
        const requestData = { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: req.file.mimetype, data: imageBase64 } }] }] };
        const apiResponse = await axios.post(API_URL, requestData);
        
        const responseText = apiResponse.data.candidates[0].content.parts[0].text;
        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonData = JSON.parse(cleanedText);

        req.session.documentData[docType] = jsonData;
        
        res.json({ success: true, message: `${docType.replace(/_/g, ' ')} uploaded successfully.`, extractedData: jsonData });

    } catch (error) {
        console.error("Error in /analyze-document:", error.message);
        res.status(500).json({ error: 'Failed to analyze the document.' });
    }
});

// --- API Endpoint 2: Get All Session Data for the Form ---
app.get('/get-session-data', (req, res) => {
    if (req.session.documentData) {
        res.json({ success: true, data: req.session.documentData });
    } else {
        res.json({ success: false, message: 'No document data found in session.' });
    }
});

// --- API Endpoint 3: Submit Form and Destroy Session ---
app.post('/submit-form', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Could not log out, please try again.' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Form submitted and session destroyed.' });
    });
});

// --- API Endpoint 4: The NEW, SMARTER Handwritten Form Validation ---
app.post('/validate-handwritten-form', upload.single('handwrittenForm'), async (req, res) => {
    if (!req.session.documentData) {
        return res.status(400).json({ error: 'No master document data found in session. Please upload original documents first.' });
    }
    if (!req.file) {
        return res.status(400).json({ error: 'No handwritten form image uploaded.' });
    }

    try {
        // --- AI STEP 1: Extract data from the handwritten form (OCR) ---
        const imageBase64 = req.file.buffer.toString('base64');
        const ocrPrompt = `This is an image of a filled-out form which may be in English or Marathi. Extract all handwritten text entries and their corresponding printed labels. Return the result as a single, flat JSON object where keys are the labels and values are the handwritten entries.`;
        
        let ocrRequestData = { contents: [{ parts: [{ text: ocrPrompt }, { inline_data: { mime_type: req.file.mimetype, data: imageBase64 } }] }] };
        let ocrApiResponse = await axios.post(API_URL, ocrRequestData);

        let responseText = ocrApiResponse.data.candidates[0].content.parts[0].text;
        let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const handwrittenData = JSON.parse(cleanedText);

        // --- AI STEP 2: Use Gemini as an "Arbitrator" to compare the two JSONs ---
        const masterData = Object.values(req.session.documentData).reduce((acc, cur) => ({ ...acc, ...cur }), {});

        const arbitratorPrompt = `
You are an expert data validation assistant. I have two JSON objects.
1. masterData: This contains data extracted from official documents. This is the source of truth.
2. handwrittenData: This contains data extracted from a handwritten form. The labels might be slightly different (e.g., 'Full Name' vs 'Name') or in a different language (e.g., 'Name' vs 'नाव').

Your task is to compare these two. For each field in masterData, find its corresponding field in handwrittenData, even if the label is different or in another language. Then, calculate a similarity score between their values from 0.0 to 1.0, where 1.0 is an exact match, considering potential minor spelling errors.

Here is the data:
masterData: ${JSON.stringify(masterData)}
handwrittenData: ${JSON.stringify(handwrittenData)}

Return your analysis ONLY as a valid JSON array of objects. Each object must have these keys: "field" (from masterData), "masterValue", "handwrittenValue", and "similarity". If a corresponding field is not found in handwrittenData, set "handwrittenValue" to "Not Found" and "similarity" to 0.0.
`;

        let arbitratorRequestData = { contents: [{ parts: [{ text: arbitratorPrompt }] }] };
        let arbitratorApiResponse = await axios.post(API_URL, arbitratorRequestData);

        responseText = arbitratorApiResponse.data.candidates[0].content.parts[0].text;
        cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const comparisonResults = JSON.parse(cleanedText);

        // --- Calculate final score and send back to the client ---
        let totalSimilarity = 0;
        let comparedFields = 0;

        comparisonResults.forEach(item => {
            if (item.masterValue && item.masterValue !== 'N/A' && item.masterValue !== '') {
                totalSimilarity += item.similarity;
                comparedFields++;
            }
        });

        const overallSimilarity = comparedFields > 0 ? totalSimilarity / comparedFields : 0;

        res.json({
            comparison: comparisonResults,
            overallSimilarity: overallSimilarity
        });

    } catch (error) {
        console.error("Error in /validate-handwritten-form:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to process the handwritten form.' });
    }
});

// --- Start the Server ---
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});