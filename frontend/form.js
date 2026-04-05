// form.js — Populate form fields from session data, highlight AI-filled fields

// ─── Toast ────────────────────────────────────────────────────
function showToast(message, type = 'error', duration = 4000) {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-visible'));
    setTimeout(() => {
        t.classList.remove('toast-visible');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, duration);
}

// Map of session field key → [array of html input IDs that could receive it]
const FIELD_MAP = {
    // Personal
    name:       ['name'],
    fatherName: ['fatherName'],
    motherName: ['motherName'],
    dob:        ['dob'],
    gender:     ['gender'],
    address:    ['address'],
    // Documents
    aadharNumber: ['aadharNumber'],
    panNumber:    ['panNumber'],
    casteName:    ['casteName'],
    // Education/domicile
    seatNo:    ['seatNo'],
    boardName: ['boardName'],
    percentage:['percentage'],
    district:  ['district'],
    state:     ['state'],
    territory: ['state'],   // domicile territory → same field
    serialNo:  ['serialNo'],
    issueDate: ['issueDate'],
};

// Source labels per doc type
const SOURCE_LABELS = {
    aadhar:               '🪪 Aadhaar Card',
    pan:                  '💳 PAN Card',
    marksheet_10th:       '📚 10th Marksheet',
    caste_certificate:    '📄 Caste Certificate',
    domicile_certificate: '📋 Domicile Certificate',
};

document.addEventListener('DOMContentLoaded', async () => {
    const summaryDocsList = document.getElementById('summaryDocsList');
    const form            = document.getElementById('verificationForm');
    const successModal    = document.getElementById('successModal');

    // Track which fields were AI-filled and from which doc
    const filledFields = {}; // { fieldId: docType }

    // ── Fetch session data & populate form ──────────────────
    try {
        const rawData = localStorage.getItem('documentData');
        
        if (rawData) {
            const sessionData = JSON.parse(rawData); // { aadhar: {...}, pan: {...}, ... }

            // Populate summary list
            for (const [docType, docData] of Object.entries(sessionData)) {
                const li    = document.createElement('li');
                li.className = 'uploaded-doc-item';
                const icon  = document.createElement('span');
                icon.className   = 'doc-check';
                icon.textContent = '✅';
                const label = document.createElement('strong');
                label.textContent = SOURCE_LABELS[docType] || docType;
                li.appendChild(icon);
                li.appendChild(label);
                summaryDocsList.appendChild(li);
            }

            // Fill form fields — iterate each doc type
            for (const [docType, docData] of Object.entries(sessionData)) {
                for (const [key, value] of Object.entries(docData)) {
                    if (!value) continue;
                    const targetIds = FIELD_MAP[key];
                    if (!targetIds) continue;

                    for (const fieldId of targetIds) {
                        const el = document.getElementById(fieldId);
                        if (!el || el.value) continue; // Don't overwrite already-filled fields
                        el.value = value;
                        el.classList.add('ai-filled');
                        filledFields[fieldId] = docType;

                        // Show source badge
                        const badge = document.getElementById(`badge-${fieldId}`);
                        if (badge) {
                            badge.textContent = `🤖 Auto-filled from ${SOURCE_LABELS[docType] || docType}`;
                            badge.style.display = 'inline-flex';
                        }
                    }
                }
            }

            // When user edits an AI-filled field, remove the highlight
            document.querySelectorAll('.form-input').forEach(input => {
                input.addEventListener('input', () => {
                    if (input.classList.contains('ai-filled') && filledFields[input.id]) {
                        input.classList.remove('ai-filled');
                        const badge = document.getElementById(`badge-${input.id}`);
                        if (badge) badge.style.display = 'none';
                        delete filledFields[input.id];
                    }
                });
            });

            showToast('Form pre-filled with extracted document data.', 'success', 3000);

        } else {
            showToast('No document data found. Please upload documents first.', 'warning');
        }
    } catch (err) {
        showToast('Failed to load session data.', 'error');
        console.error('Form load error:', err);
    }

    // ── Form submission ──────────────────────────────────────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submitButton');
        submitBtn.disabled  = true;
        submitBtn.textContent = 'Submitting…';

        try {
            // Simulate submission since we operate purely on frontend state now
            // Clear local storage equivalent to clearing session
            localStorage.removeItem('documentData');
            
            setTimeout(() => {
                successModal.classList.add('active');
            }, 1000);
        } catch (err) {
            showToast(`Submission failed: ${err.message}`, 'error');
            submitBtn.disabled   = false;
            submitBtn.textContent = '🚀 Verify & Submit';
        }
    });
});