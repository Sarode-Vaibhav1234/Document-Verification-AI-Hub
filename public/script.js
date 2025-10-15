document.addEventListener('DOMContentLoaded', () => {
    const uploader = document.getElementById('documentUploader');
    const uploadButton = document.getElementById('uploadButton');
    const loader = document.getElementById('loader');
    const docTypeSelect = document.getElementById('docTypeSelect');
    const resultContainer = document.getElementById('resultContainer');
    const uploadedDocsList = document.getElementById('uploadedDocsList');
    const proceedButton = document.getElementById('proceedButton');
    const fileNameDisplay = document.getElementById('fileName');

    uploader.addEventListener('change', () => {
        fileNameDisplay.textContent = uploader.files.length > 0 ? uploader.files[0].name : '';
    });

    uploadButton.addEventListener('click', async () => {
        const file = uploader.files[0];
        if (!file) {
            alert('Please select a file first!');
            return;
        }

        const docType = docTypeSelect.value;
        loader.classList.remove('hidden');
        uploadButton.disabled = true;

        const formData = new FormData();
        formData.append('document', file);
        formData.append('docType', docType);

        try {
            const response = await fetch('/analyze-document', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            // Add the uploaded document to our list
            const listItem = document.createElement('li');
            listItem.textContent = `✅ ${result.message}`;
            uploadedDocsList.appendChild(listItem);
            
            // Show the container and proceed button
            resultContainer.classList.remove('hidden');
            proceedButton.classList.remove('hidden');
            
            // Clear file input for next upload
            uploader.value = '';
            fileNameDisplay.textContent = '';
            
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            loader.classList.add('hidden');
            uploadButton.disabled = false;
        }
    });

    proceedButton.addEventListener('click', () => {
        window.location.href = '/form.html';
    });
});
// Add this towards the end of your public/script.js file
document.addEventListener('DOMContentLoaded', () => {
    // ... (all your existing code for uploader, uploadButton, etc.)

    const proceedButton = document.getElementById('proceedButton');
    const validateOfflineButton = document.getElementById('validateOfflineButton'); // Get the new button

    uploadButton.addEventListener('click', async () => {
        // ... (existing click logic)

        try {
            // ... (existing try block)
            
            // In the success part, make sure both buttons are shown
            resultContainer.classList.remove('hidden');
            proceedButton.classList.remove('hidden');
            validateOfflineButton.classList.remove('hidden'); // Show the new button
            
        } catch (error) {
            // ... (existing catch block)
        } finally {
            // ... (existing finally block)
        }
    });

    proceedButton.addEventListener('click', () => {
        window.location.href = '/form.html';
    });

    // === ADD EVENT LISTENER FOR NEW BUTTON ===
    validateOfflineButton.addEventListener('click', () => {
        window.location.href = '/offline-validator.html';
    });
});