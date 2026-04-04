// ── Toast ──────────────────────────────────────────────────
function toast(msg, type = 'error', dur = 4000) {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-visible'));
  setTimeout(() => { t.classList.remove('toast-visible'); t.addEventListener('transitionend', () => t.remove(), { once: true }); }, dur);
}

// ── DOM refs ───────────────────────────────────────────────
const dropZone       = document.getElementById('dropZone');
const fileInput      = document.getElementById('fileInput');
const analyzeBtn     = document.getElementById('analyzeBtn');
const stepsPanel     = document.getElementById('stepsPanel');
const resultsSection = document.getElementById('resultsSection');
let currentFile = null;

// ── File handling ──────────────────────────────────────────
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('Please select an image file.', 'toast-warn'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('File must be under 5 MB.', 'toast-error'); return; }
  currentFile = file;

  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('previewThumb').src = e.target.result;
    document.getElementById('originalDisplay').src = e.target.result;
  };
  reader.readAsDataURL(file);

  document.getElementById('previewName').textContent = file.name;
  document.getElementById('previewSizeInfo').textContent = `${(file.size / 1024).toFixed(1)} KB · ${file.type}`;
  document.getElementById('previewBanner').classList.add('show');
  analyzeBtn.disabled = false;
  resultsSection.style.display = 'none';
  stepsPanel.style.display     = 'none';
}

fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});

// ── Step UI helpers ────────────────────────────────────────
function stepActive(id) {
  const el = document.getElementById(id);
  el.classList.add('active');
  const spinner = document.createElement('div');
  spinner.className = 'step-spinner';
  el.appendChild(spinner);
}
function stepDone(id, icon) {
  const el = document.getElementById(id);
  el.classList.remove('active'); el.classList.add('done');
  const spinner = el.querySelector('.step-spinner');
  if (spinner) spinner.remove();
  el.querySelector('.step-icon').textContent = icon || '✅';
}

// ── ELA (Error Level Analysis) ─────────────────────────────
function runELA(imageFile) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const origURL = URL.createObjectURL(imageFile);
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight;
      // Draw original
      const origC = document.createElement('canvas');
      origC.width = W; origC.height = H;
      const origCtx = origC.getContext('2d');
      origCtx.drawImage(img, 0, 0);
      const origData = origCtx.getImageData(0, 0, W, H);
      URL.revokeObjectURL(origURL);

      // Re-compress at quality 0.75
      origC.toBlob(blob => {
        const recompImg = new Image();
        const recompURL = URL.createObjectURL(blob);
        recompImg.onload = () => {
          const recompC = document.createElement('canvas');
          recompC.width = W; recompC.height = H;
          const recompCtx = recompC.getContext('2d');
          recompCtx.drawImage(recompImg, 0, 0);
          const recompData = recompCtx.getImageData(0, 0, W, H);
          URL.revokeObjectURL(recompURL);

          // Compute ELA heatmap
          const elaC = document.getElementById('elaCanvas');
          elaC.width = W; elaC.height = H;
          const elaCtx = elaC.getContext('2d');
          const elaImg = elaCtx.createImageData(W, H);

          const SCALE = 15;
          let totalDiff = 0;
          const pixelCount = W * H;

          for (let i = 0; i < origData.data.length; i += 4) {
            const rD = Math.abs(origData.data[i]   - recompData.data[i]);
            const gD = Math.abs(origData.data[i+1] - recompData.data[i+1]);
            const bD = Math.abs(origData.data[i+2] - recompData.data[i+2]);
            const diff = ((rD + gD + bD) / 3) * SCALE / 255;
            const norm = Math.min(1, diff);
            totalDiff += ((rD + gD + bD) / 3);

            // Colour gradient: dark-blue → cyan → green → yellow → red
            let r, g, b;
            if      (norm < 0.25) { r=0;                     g=0;                     b=Math.round(norm*4*200+55); }
            else if (norm < 0.5)  { const t=(norm-.25)*4; r=0;                     g=Math.round(t*255);       b=Math.round((1-t)*255); }
            else if (norm < 0.75) { const t=(norm-.5)*4;  r=Math.round(t*255);    g=255;                     b=0; }
            else                  { const t=(norm-.75)*4; r=255;                   g=Math.round((1-t)*255);   b=0; }

            elaImg.data[i]=r; elaImg.data[i+1]=g; elaImg.data[i+2]=b; elaImg.data[i+3]=255;
          }
          elaCtx.putImageData(elaImg, 0, 0);

          const avgDiff = totalDiff / pixelCount;
          resolve(avgDiff);
        };
        recompImg.onerror = reject;
        recompImg.src = recompURL;
      }, 'image/jpeg', 0.75);
    };
    img.onerror = reject;
    img.src = origURL;
  });
}

// ── Risk Score Calculation ─────────────────────────────────
function calcRiskScore(elaAvg, anomalies) {
  const elaScore = Math.min(60, (elaAvg / 18) * 60);
  const critPts  = anomalies.filter(a => a.severity === 'CRITICAL').length * 30;
  const medPts   = anomalies.filter(a => a.severity === 'MEDIUM').length * 8;
  const lowPts   = anomalies.filter(a => a.severity === 'LOW').length * 4;
  return Math.min(100, Math.round(elaScore + critPts + medPts + lowPts));
}

function verdictFromScore(score) {
  if (score < 25) return { cls: 'genuine',  icon: '✅', title: 'Likely Genuine',                desc: 'No significant signs of digital tampering were detected. ELA patterns appear consistent with an authentic document.' };
  if (score < 55) return { cls: 'review',   icon: '⚠️', title: 'Review Recommended',            desc: 'Some anomalies were detected. The document may have been saved or converted multiple times. Manual review is advised.' };
  return             { cls: 'tampered',  icon: '🚨', title: 'Possible Tampering Detected',   desc: 'High-risk indicators found. ELA shows uneven compression patterns and/or metadata reveals editing software. Treat with caution.' };
}

function riskColor(score) {
  if (score < 25) return 'linear-gradient(90deg,#059669,#10b981)';
  if (score < 55) return 'linear-gradient(90deg,#d97706,#f59e0b)';
  return 'linear-gradient(90deg,#dc2626,#ef4444)';
}

// ── Main Analysis ──────────────────────────────────────────
analyzeBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  analyzeBtn.disabled = true;
  resultsSection.style.display = 'none';
  stepsPanel.style.display = 'block';
  ['step1', 'step2', 'step3'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active', 'done');
    const sp = el.querySelector('.step-spinner');
    if (sp) sp.remove();
    el.querySelector('.step-icon').textContent = ['🖼️', '🗂️', '⚖️'][['step1', 'step2', 'step3'].indexOf(id)];
  });

  try {
    // Step 1: ELA
    stepActive('step1');
    const elaAvg = await runELA(currentFile);
    stepDone('step1', '🖼️');

    // Step 2: Metadata
    stepActive('step2');
    const fd = new FormData(); fd.append('document', currentFile);
    const metaResp = await fetch(`${window.API_BASE_URL}/analyze-metadata`, { method: 'POST', body: fd, credentials: 'include' });
    const metaData = await metaResp.json();
    stepDone('step2', '🗂️');

    // Step 3: Risk score
    stepActive('step3');
    await new Promise(r => setTimeout(r, 600));
    const riskScore = calcRiskScore(elaAvg, metaData.anomalies || []);
    const verdict   = verdictFromScore(riskScore);
    stepDone('step3', '⚖️');

    renderResults(riskScore, verdict, elaAvg, metaData);
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    toast(`Analysis failed: ${err.message}`, 'toast-error');
  } finally {
    analyzeBtn.disabled = false;
  }
});

// ── Render Results ─────────────────────────────────────────
function renderResults(score, verdict, elaAvg, metaData) {
  // Verdict banner
  const banner = document.getElementById('verdictBanner');
  banner.className = '';
  banner.id = 'verdictBanner';
  banner.classList.add(verdict.cls);
  document.getElementById('verdictIcon').textContent  = verdict.icon;
  document.getElementById('verdictTitle').textContent = verdict.title;
  document.getElementById('verdictDesc').textContent  = verdict.desc;
  document.getElementById('verdictScore').textContent = score + '%';
  document.getElementById('verdictScore').style.color = score < 25 ? '#10b981' : score < 55 ? '#f59e0b' : '#ef4444';

  // Risk bar
  const fill = document.getElementById('riskBarFill');
  fill.style.width = '0%';
  fill.style.background = riskColor(score);
  setTimeout(() => { fill.style.width = score + '%'; }, 100);

  // ELA detail
  document.getElementById('elaScoreDetail').innerHTML =
    `<strong style="color:var(--text);">Average pixel difference:</strong> <span style="color:var(--accent2);font-family:monospace;">${elaAvg.toFixed(3)}</span> &nbsp;|&nbsp;
     <strong style="color:var(--text);">Interpretation:</strong> ${elaAvg < 4 ? '✅ Low (consistent with authentic document)' : elaAvg < 10 ? '⚠️ Moderate (possible re-saves or conversion)' : '🚨 High (strong tampering signature)'}`;

  // Anomalies
  const anomalyList = document.getElementById('anomalyList');
  anomalyList.innerHTML = '';
  if (!metaData.anomalies || metaData.anomalies.length === 0) {
    const div = document.createElement('div');
    div.className = 'no-anomalies';
    div.innerHTML = '✅ No metadata anomalies detected. No editing software signatures found.';
    anomalyList.appendChild(div);
  } else {
    metaData.anomalies.forEach(a => {
      const item = document.createElement('div');
      item.className = `anomaly-item ${a.severity}`;
      item.innerHTML = `
        <span class="anomaly-severity">${a.severity}</span>
        <div class="anomaly-body">
          <div class="anomaly-field">${a.field}</div>
          <div class="anomaly-msg">${a.message}</div>
          ${a.value ? `<div class="anomaly-value">${a.value}</div>` : ''}
        </div>`;
      anomalyList.appendChild(item);
    });
  }

  // Metadata table
  const tbody = document.getElementById('metaTableBody');
  tbody.innerHTML = '';
  const flagFields = (metaData.anomalies || []).map(a => a.field.toLowerCase());
  const exif = metaData.exif || {};
  const displayKeys = ['Software', 'Make', 'Model', 'DateTime', 'DateTimeOriginal', 'DateTimeDigitized',
                       'latitude', 'longitude', 'ImageWidth', 'ImageHeight', 'ColorSpace', 'XResolution', 'YResolution'];

  const fileRows = [
    ['File Name',    metaData.fileInfo?.name     || '—'],
    ['File Size',    metaData.fileInfo?.size ? `${(metaData.fileInfo.size / 1024).toFixed(1)} KB` : '—'],
    ['MIME Type',    metaData.fileInfo?.mimeType  || '—'],
    ['EXIF Present', metaData.hasExif ? 'Yes' : 'No (or stripped)'],
  ];
  fileRows.forEach(([k, v]) => {
    const tr  = document.createElement('tr');
    const td1 = document.createElement('td'); td1.className = 'meta-key';   td1.textContent = k;
    const td2 = document.createElement('td'); td2.className = 'meta-value'; td2.textContent = v;
    tr.appendChild(td1); tr.appendChild(td2); tbody.appendChild(tr);
  });

  displayKeys.forEach(key => {
    if (exif[key] === undefined) return;
    const tr  = document.createElement('tr');
    const td1 = document.createElement('td'); td1.className = 'meta-key';   td1.textContent = key;
    const td2 = document.createElement('td'); td2.className = 'meta-value';
    const val = exif[key] instanceof Date ? exif[key].toLocaleString() : String(exif[key]);
    td2.textContent = val;
    if (flagFields.some(f => f.includes(key.toLowerCase()))) {
      const badge = document.createElement('span'); badge.className = 'meta-flag'; badge.textContent = '⚠ Flagged';
      td2.appendChild(badge);
    }
    tr.appendChild(td1); tr.appendChild(td2); tbody.appendChild(tr);
  });

  if (tbody.rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="2" style="color:var(--muted);text-align:center;padding:24px;">No metadata found in this file.</td>';
    tbody.appendChild(tr);
  }
}
