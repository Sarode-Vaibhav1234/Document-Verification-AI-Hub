// ── Toast ─────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-visible'));
    setTimeout(() => { t.classList.remove('toast-visible'); t.addEventListener('transitionend', () => t.remove(), { once: true }); }, duration);
}

const fileInput    = document.getElementById('fileInput');
const verifyBtn    = document.getElementById('verifyBtn');
const resultsList  = document.getElementById('results-list');
const fileCountEl  = document.getElementById('file-count');
const downloadBtn  = document.getElementById('downloadBtn');
const dropZone     = document.getElementById('dropZone');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel= document.getElementById('progressLabel');
const noResults    = document.getElementById('no-results');

let verifiedAadhaarFiles = [];

// ── File count update ─────────────────────────────────────
fileInput.addEventListener('change', () => {
    const count = fileInput.files.length;
    fileCountEl.textContent = count === 0 ? 'No files selected' : `${count} file${count > 1 ? 's' : ''} selected`;
});

// ── Drag and drop ─────────────────────────────────────────
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const dt = new DataTransfer();
    [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')).forEach(f => dt.items.add(f));
    fileInput.files = dt.files;
    fileCountEl.textContent = `${dt.files.length} file${dt.files.length > 1 ? 's' : ''} selected`;
});

// ── Verify ────────────────────────────────────────────────
verifyBtn.addEventListener('click', async () => {
    const files = fileInput.files;
    if (files.length === 0) { showToast('Please select one or more image files', 'warning'); return; }

    noResults && noResults.remove();
    resultsList.innerHTML = '';
    verifiedAadhaarFiles = [];
    downloadBtn.style.display = 'none';
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Processing…';
    progressWrap.style.display = 'block';

    const total = files.length;
    let done = 0;

    for (const file of files) {
        const resultItem = createResultItem(file);
        resultsList.appendChild(resultItem);

        try {
            const formData = new FormData();
            formData.append('image', file);
            const resp = await fetch(`${window.API_BASE_URL}/classify-document?type=aadhaar`, { method: 'POST', body: formData, credentials: 'include' });
            const json = await resp.json();
            updateResultItem(resultItem, json, file);
        } catch (err) {
            updateResultItem(resultItem, { error: err.message || 'Processing failed' });
        }

        done++;
        const pct = Math.round((done / total) * 100);
        progressFill.style.width  = pct + '%';
        progressLabel.textContent = `${done} / ${total} processed`;
    }

    if (verifiedAadhaarFiles.length > 0) downloadBtn.style.display = 'block';
    verifyBtn.disabled = false;
    verifyBtn.textContent = '⚡ Verify All Selected Files';
    showToast(`Done — ${verifiedAadhaarFiles.length}/${total} Aadhaar cards verified.`, 'info');
});

// ── Download ZIP ──────────────────────────────────────────
downloadBtn.addEventListener('click', async () => {
    if (!verifiedAadhaarFiles.length) return;
    downloadBtn.disabled = true; downloadBtn.textContent = 'Zipping files…';
    const zip = new JSZip();
    verifiedAadhaarFiles.forEach(f => zip.file(f.name, f));
    const content = await zip.generateAsync({ type: 'blob' });
    const link    = document.createElement('a');
    link.href     = URL.createObjectURL(content);
    link.download = 'Verified_Aadhaar_Cards.zip';
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(link.href);
    downloadBtn.disabled = false; downloadBtn.textContent = '⬇️ Download Verified Aadhaar Cards (.zip)';
});

// ── Create result item ────────────────────────────────────
function createResultItem(file) {
    const item = document.createElement('li');
    item.className = 'result-item';

    const thumb = document.createElement('img');
    thumb.className = 'result-thumb';
    thumb.alt = file.name;
    const reader = new FileReader();
    reader.onload = e => { thumb.src = e.target.result; };
    reader.readAsDataURL(file);

    const filename = document.createElement('span');
    filename.className = 'filename';
    filename.textContent = file.name;   // Safe — textContent, no XSS

    const tag = document.createElement('div');
    tag.className = 'result-tag tag-processing';
    tag.textContent = 'Processing…';

    const details = document.createElement('div');
    details.className = 'result-details';

    item.appendChild(thumb);
    item.appendChild(filename);
    item.appendChild(tag);
    item.appendChild(details);
    return item;
}

// ── Update result item ────────────────────────────────────
function updateResultItem(item, result, file) {
    const tag     = item.querySelector('.result-tag');
    const details = item.querySelector('.result-details');
    const required = ['photo', 'logo', 'aadhar no', 'qr'];
    const found   = {};
    const threshold = 0.60;

    if (result.predictions?.length > 0) {
        for (const pred of result.predictions) {
            if (required.includes(pred.class) && pred.confidence > threshold) {
                if (!found[pred.class] || pred.confidence > found[pred.class]) {
                    found[pred.class] = pred.confidence;
                }
            }
        }
    }

    const hasAll = required.every(el => el in found);
    if (hasAll) {
        const avg = Object.values(found).reduce((s, v) => s + v, 0) / Object.values(found).length;
        tag.textContent  = `✅ Aadhaar (${(avg * 100).toFixed(1)}%)`;
        tag.className    = 'result-tag tag-success';
        details.textContent = 'All key elements detected successfully.';
        if (file) verifiedAadhaarFiles.push(file);
    } else {
        const missing = required.filter(el => !(el in found));
        tag.textContent  = '❌ Not Aadhaar';
        tag.className    = 'result-tag tag-fail';
        details.textContent = missing.length ? `Missing: ${missing.join(', ')}` : 'Confidence too low on key elements.';
    }
}
