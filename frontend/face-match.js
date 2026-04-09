// ─── Toast ────────────────────────────────────────────────
function toast(msg, type = 'info', dur = 4000) {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-visible'));
  setTimeout(() => { t.classList.remove('toast-visible'); t.addEventListener('transitionend', () => t.remove(), { once: true }); }, dur);
}

// ─── State ────────────────────────────────────────────────
const MODEL_URL   = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
let modelsLoaded  = false;
let idImageEl     = null;   // HTMLImageElement for ID
let selfieImageEl = null;   // HTMLImageElement for selfie
let webcamStream  = null;
let webcamActive  = false;

// ─── DOM refs ─────────────────────────────────────────────
const modelBanner       = document.getElementById('modelBanner');
const modelStatus       = document.getElementById('modelStatus');
const modelProgressFill = document.getElementById('modelProgressFill');
const modelPct          = document.getElementById('modelPct');

const idDropZone        = document.getElementById('idDropZone');
const idFileInput       = document.getElementById('idFileInput');
const idPreviewWrap     = document.getElementById('idPreviewWrap');
const idCanvas          = document.getElementById('idCanvas');
const idFaceBadge       = document.getElementById('idFaceBadge');

const selfieDropZone    = document.getElementById('selfieDropZone');
const selfieFileInput   = document.getElementById('selfieFileInput');
const selfiePreviewWrap = document.getElementById('selfiePreviewWrap');
const selfieCanvas      = document.getElementById('selfieCanvas');
const selfieFaceBadge   = document.getElementById('selfieFaceBadge');

const webcamBtn         = document.getElementById('webcamBtn');
const captureBtn        = document.getElementById('captureBtn');
const webcamVideo       = document.getElementById('webcamVideo');
const compareBtn        = document.getElementById('compareBtn');
const processingOverlay = document.getElementById('processingOverlay');
const resultsSection    = document.getElementById('resultsSection');

// ─── Load face-api.js models ──────────────────────────────
async function loadModels() {
  const steps = [
    () => faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    () => faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    () => faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ];
  const labels = ['Tiny Face Detector', 'Face Landmark Net', 'Face Recognition Net'];

  for (let i = 0; i < steps.length; i++) {
    modelStatus.textContent = `Loading ${labels[i]}… (${i + 1}/${steps.length})`;
    const pct = Math.round((i / steps.length) * 100);
    modelProgressFill.style.width = pct + '%'; modelPct.textContent = pct + '%';
    await steps[i]();
  }
  modelProgressFill.style.width = '100%'; modelPct.textContent = '100%';
  modelStatus.textContent = '✅ Face recognition models ready!';
  setTimeout(() => modelBanner.classList.add('hidden'), 1500);
  modelsLoaded = true;
  updateCompareBtn();
}

// Wait for face-api.js script to finish loading then load models
window.addEventListener('load', () => {
  if (typeof faceapi !== 'undefined') {
    loadModels().catch(() => {
      modelStatus.textContent = '❌ Failed to load models. Check your internet connection.';
      toast('Could not load face recognition models.', 'toast-error');
    });
  } else {
    modelStatus.textContent = '❌ face-api.js failed to load from CDN.';
  }
});

// ─── Update compare button state ──────────────────────────
function updateCompareBtn() {
  compareBtn.disabled = !(modelsLoaded && idImageEl && selfieImageEl);
}

// ─── Load image into canvas + detect face ─────────────────
async function loadImageToCanvas(file, canvas, badge, previewWrap) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = async () => {
        // Draw to canvas
        const maxW = 420, maxH = 320;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        previewWrap.classList.add('show');

        // Detect face if models loaded
        if (modelsLoaded) {
          badge.textContent = '🔍 Detecting face…';
          badge.className   = 'face-badge';
          try {
            const det = await faceapi
              .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
              .withFaceLandmarks(true)
              .withFaceDescriptor();
            if (det) {
              badge.textContent = '✅ Face detected';
              badge.className   = 'face-badge found';
              const dims = faceapi.matchDimensions(canvas, { width: w, height: h }, true);
              faceapi.draw.drawDetections(canvas, faceapi.resizeResults(det, dims));
              resolve({ img, det });
            } else {
              badge.textContent = '⚠ No face detected';
              badge.className   = 'face-badge none';
              resolve({ img, det: null });
            }
          } catch (err) {
            badge.textContent = '⚠ Detection error';
            badge.className   = 'face-badge none';
            resolve({ img, det: null });
          }
        } else {
          badge.textContent = '⏳ Models loading…';
          badge.className   = 'face-badge';
          resolve({ img, det: null });
        }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── ID Document upload ───────────────────────────────────
idDropZone.addEventListener('click', () => idFileInput.click());

idFileInput.addEventListener('change', async () => {
  const file = idFileInput.files[0];
  if (!file) return;
  idDropZone.style.display = 'none';
  try {
    const result = await loadImageToCanvas(file, idCanvas, idFaceBadge, idPreviewWrap);
    idImageEl = result.img;
    updateCompareBtn();
  } catch { toast('Failed to load ID image.', 'toast-error'); }
});
idDropZone.addEventListener('dragover', e => { e.preventDefault(); idDropZone.classList.add('dov'); });
idDropZone.addEventListener('dragleave', () => idDropZone.classList.remove('drag-over'));
idDropZone.addEventListener('drop', e => {
  e.preventDefault(); idDropZone.classList.remove('dov');
  const file = e.dataTransfer.files[0];
  if (file) { const dt = new DataTransfer(); dt.items.add(file); idFileInput.files = dt.files; idFileInput.dispatchEvent(new Event('change')); }
});

// ─── Selfie upload ────────────────────────────────────────
selfieDropZone.addEventListener('click', () => selfieFileInput.click());

selfieFileInput.addEventListener('change', async () => {
  const file = selfieFileInput.files[0];
  if (!file) return;
  stopWebcam();
  selfieDropZone.style.display = 'none';
  try {
    const result = await loadImageToCanvas(file, selfieCanvas, selfieFaceBadge, selfiePreviewWrap);
    selfieImageEl = result.img;
    updateCompareBtn();
  } catch { toast('Failed to load selfie image.', 'toast-error'); }
});
selfieDropZone.addEventListener('dragover', e => { e.preventDefault(); selfieDropZone.classList.add('dov'); });
selfieDropZone.addEventListener('dragleave', () => selfieDropZone.classList.remove('dov'));
selfieDropZone.addEventListener('drop', e => {
  e.preventDefault(); selfieDropZone.classList.remove('dov');
  const file = e.dataTransfer.files[0];
  if (file) { const dt = new DataTransfer(); dt.items.add(file); selfieFileInput.files = dt.files; selfieFileInput.dispatchEvent(new Event('change')); }
});

// ─── Webcam ───────────────────────────────────────────────
webcamBtn.addEventListener('click', async () => {
  if (webcamActive) { stopWebcam(); return; }
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    webcamVideo.srcObject = webcamStream;
    webcamVideo.style.display = 'block';
    captureBtn.style.display  = 'block';
    selfieDropZone.style.display = 'none';
    webcamBtn.textContent = '⏹ Stop Webcam';
    webcamActive = true;
  } catch {
    toast('Camera access denied. Please allow camera or upload a photo.', 'toast-warn');
  }
});

captureBtn.addEventListener('click', () => {
  if (!webcamVideo.srcObject) return;
  const w = webcamVideo.videoWidth || 640;
  const h = webcamVideo.videoHeight || 480;
  selfieCanvas.width = w; selfieCanvas.height = h;
  const ctx = selfieCanvas.getContext('2d');
  ctx.scale(-1, 1); ctx.drawImage(webcamVideo, -w, 0, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0);
  selfiePreviewWrap.classList.add('show');
  selfieFaceBadge.textContent = '🔍 Detecting face…';
  selfieFaceBadge.className   = 'face-badge';
  stopWebcam();

  const dataUrl = selfieCanvas.toDataURL('image/jpeg', .9);
  const img = new Image(); img.src = dataUrl;
  img.onload = async () => {
    selfieImageEl = img;
    if (modelsLoaded) {
      try {
        const det = await faceapi.detectSingleFace(selfieCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
          .withFaceLandmarks(true).withFaceDescriptor();
        if (det) {
          selfieFaceBadge.textContent = '✅ Face detected';
          selfieFaceBadge.className   = 'face-badge found';
          const dims = faceapi.matchDimensions(selfieCanvas, { width: w, height: h }, true);
          faceapi.draw.drawDetections(selfieCanvas, faceapi.resizeResults(det, dims));
        } else {
          selfieFaceBadge.textContent = '⚠ No face detected';
          selfieFaceBadge.className   = 'face-badge none';
        }
      } catch { selfieFaceBadge.textContent = '⚠ Detection error'; }
    }
    updateCompareBtn();
  };
});

function stopWebcam() {
  if (webcamStream) { webcamStream.getTracks().forEach(t => t.stop()); webcamStream = null; }
  webcamVideo.style.display = 'none';
  captureBtn.style.display  = 'none';
  webcamBtn.textContent     = '📷 Open Webcam Instead';
  webcamActive = false;
}

// ─── Compare faces ────────────────────────────────────────
compareBtn.addEventListener('click', async () => {
  if (!idImageEl || !selfieImageEl || !modelsLoaded) return;
  compareBtn.disabled = true;
  processingOverlay.classList.add('show');
  resultsSection.style.display = 'none';

  try {
    const idDet = await faceapi
      .detectSingleFace(idCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
      .withFaceLandmarks(true).withFaceDescriptor();

    const selfieDet = await faceapi
      .detectSingleFace(selfieCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
      .withFaceLandmarks(true).withFaceDescriptor();

    if (!idDet) {
      toast('No face found in the ID document. Please upload a clearer image.', 'toast-warn');
      return;
    }
    if (!selfieDet) {
      toast('No face found in the selfie. Please upload a clearer photo or retake with webcam.', 'toast-warn');
      return;
    }

    const distance   = faceapi.euclideanDistance(idDet.descriptor, selfieDet.descriptor);
    const similarity = Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));

    cropFaceToCropCanvas(idCanvas,     idDet.detection.box,     document.getElementById('idFaceCrop'));
    cropFaceToCropCanvas(selfieCanvas, selfieDet.detection.box, document.getElementById('selfieFaceCrop'));

    renderMatchResult(similarity, distance);
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    toast(`Face comparison failed: ${err.message}`, 'toast-error');
  } finally {
    processingOverlay.classList.remove('show');
    compareBtn.disabled = false;
  }
});

// ─── Crop detected face to a circular canvas ──────────────
function cropFaceToCropCanvas(srcCanvas, box, destCanvas) {
  const ctx  = destCanvas.getContext('2d');
  const size = 110;
  const pad  = 0.3;
  const x = Math.max(0, box.x - box.width  * pad);
  const y = Math.max(0, box.y - box.height * pad);
  const w = Math.min(srcCanvas.width  - x, box.width  * (1 + pad * 2));
  const h = Math.min(srcCanvas.height - y, box.height * (1 + pad * 2));
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(srcCanvas, x, y, w, h, 0, 0, size, size);
}

// ─── Render match result ──────────────────────────────────
function renderMatchResult(similarity, distance) {
  const scoreEl = document.getElementById('simScore');
  let current = 0;
  const step  = Math.ceil(similarity / 40);
  const timer = setInterval(() => {
    current = Math.min(similarity, current + step);
    scoreEl.textContent = current + '%';
    if (current >= similarity) clearInterval(timer);
  }, 25);
  scoreEl.style.color = similarity >= 75 ? '#10b981' : similarity >= 55 ? '#f59e0b' : '#ef4444';

  const barFill = document.getElementById('simBarFill');
  barFill.style.width = '0%';
  barFill.style.background = similarity >= 75
    ? 'linear-gradient(90deg,#059669,#10b981)'
    : similarity >= 55 ? 'linear-gradient(90deg,#d97706,#f59e0b)'
    : 'linear-gradient(90deg,#dc2626,#ef4444)';
  setTimeout(() => { barFill.style.width = similarity + '%'; }, 100);

  const verdict = document.getElementById('matchVerdict');
  if (similarity >= 75) {
    verdict.className = 'match';
    document.getElementById('verdictIcon').textContent  = '✅';
    document.getElementById('verdictTitle').textContent = 'Faces Match — Identity Verified';
    document.getElementById('verdictDesc').textContent  = `Strong facial similarity of ${similarity}% (distance: ${distance.toFixed(3)}). The person in the selfie matches the ID document photo with high confidence.`;
    verdict.id = 'matchVerdict';
    toast(`Face match: ${similarity}% similarity`, 'toast-ok');
  } else if (similarity >= 55) {
    verdict.className = 'unsure';
    document.getElementById('verdictIcon').textContent  = '⚠️';
    document.getElementById('verdictTitle').textContent = 'Inconclusive — Manual Verification Recommended';
    document.getElementById('verdictDesc').textContent  = `Moderate match of ${similarity}%. Differences may be due to lighting, angle, aging, or image quality. A human reviewer should confirm.`;
    verdict.id = 'matchVerdict';
    toast(`Inconclusive: ${similarity}% similarity`, 'toast-warn');
  } else {
    verdict.className = 'nomatch';
    document.getElementById('verdictIcon').textContent  = '❌';
    document.getElementById('verdictTitle').textContent = 'No Match — Faces Are Different';
    document.getElementById('verdictDesc').textContent  = `Low facial similarity of ${similarity}% (distance: ${distance.toFixed(3)}). The selfie does not appear to match the person in the ID document.`;
    verdict.id = 'matchVerdict';
    toast(`No match: ${similarity}% similarity`, 'toast-error');
  }
}
