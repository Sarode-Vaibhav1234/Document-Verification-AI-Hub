// ─── Toast Notification System ───────────────────────────────
function showToast(message, type = 'error', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '📢'}</span><span>${message}</span>`;
    document.body.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

// ─── Main Document Upload Logic ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const uploader             = document.getElementById('documentUploader');
    const uploadButton         = document.getElementById('uploadButton');
    const loader               = document.getElementById('loader');
    const docTypeSelect        = document.getElementById('docTypeSelect');
    const resultContainer      = document.getElementById('resultContainer');
    const uploadedDocsList     = document.getElementById('uploadedDocsList');
    const proceedButton        = document.getElementById('proceedButton');
    const validateOfflineButton = document.getElementById('validateOfflineButton');
    const fileNameDisplay      = document.getElementById('fileName');
    const previewImg           = document.getElementById('previewImg');
    const previewContainer     = document.getElementById('imagePreview');
    const dropZone             = document.getElementById('dropZone');

    // ── File selection display & preview ──────────────────────
    function handleFileSelected(file) {
        if (!file) return;
        fileNameDisplay.textContent = file.name;
        if (previewContainer && previewImg) {
            const reader = new FileReader();
            reader.onload = e => {
                previewImg.src = e.target.result;
                previewContainer.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    uploader.addEventListener('change', () => handleFileSelected(uploader.files[0]));

    // ── Drag and drop support ─────────────────────────────────
    if (dropZone) {
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                const dt = new DataTransfer();
                dt.items.add(file);
                uploader.files = dt.files;
                handleFileSelected(file);
            }
        });
    }

    // ── Upload & Analyze ──────────────────────────────────────
    uploadButton.addEventListener('click', async () => {
        const file = uploader.files[0];
        if (!file) { showToast('Please select a file first!', 'warning'); return; }

        const docType = docTypeSelect.value;
        loader.classList.remove('hidden');
        uploadButton.disabled = true;

        const formData = new FormData();
        formData.append('document', file);
        formData.append('docType', docType);

        try {
            const response = await fetch(`${window.API_BASE_URL}/analyze-document`, { method: 'POST', body: formData, credentials: 'include' });
            const result   = await response.json();
            if (!response.ok) throw new Error(result.error);

            const listItem = document.createElement('li');
            listItem.className = 'uploaded-doc-item';
            listItem.innerHTML = `<span class="doc-check">✅</span> <strong>${docType.replace(/_/g, ' ')}</strong>: ${file.name}`;
            uploadedDocsList.appendChild(listItem);

            resultContainer.classList.remove('hidden');
            proceedButton.classList.remove('hidden');
            if (validateOfflineButton) validateOfflineButton.classList.remove('hidden');

            // Reset for next upload
            uploader.value = '';
            fileNameDisplay.textContent = '';
            if (previewContainer) previewContainer.classList.add('hidden');

            showToast(`${docType.replace(/_/g, ' ')} uploaded successfully!`, 'success');

        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            loader.classList.add('hidden');
            uploadButton.disabled = false;
        }
    });

    // ── Navigation ────────────────────────────────────────────
    proceedButton.addEventListener('click', () => { window.location.href = '/form.html'; });
    if (validateOfflineButton) {
        validateOfflineButton.addEventListener('click', () => { window.location.href = '/offline-validator.html'; });
    }
});