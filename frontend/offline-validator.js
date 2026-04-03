document.addEventListener('DOMContentLoaded', async () => {
    const masterDataContainer = document.getElementById('masterDataContainer');
    const uploader = document.getElementById('handwrittenUploader');
    const fileNameDisplay = document.getElementById('fileName');
    const validateButton = document.getElementById('validateButton');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('resultsContainer');
    const finalResult = document.getElementById('finalResult');
    const comparisonTableBody = document.getElementById('comparisonTableBody');

    // 1. Fetch and display master data on page load
    try {
        const response = await fetch('/get-session-data');
        const result = await response.json();
        if (result.success && result.data) {
            masterDataContainer.innerHTML = ''; // Clear loading text
            const consolidatedData = Object.values(result.data).reduce((acc, cur) => ({ ...acc, ...cur }), {});
            for (const key in consolidatedData) {
                const dataItem = document.createElement('div');
                dataItem.className = 'master-data-item';
                dataItem.innerHTML = `<strong>${key}:</strong> ${consolidatedData[key]}`;
                masterDataContainer.appendChild(dataItem);
            }
        } else {
            masterDataContainer.innerHTML = `<p class="mismatch">Could not load master data. Please <a href="/gemini-ocr.html">upload original documents</a> first.</p>`;
        }
    } catch (error) {
        masterDataContainer.innerHTML = `<p class="mismatch">Error loading master data.</p>`;
    }

    uploader.addEventListener('change', () => {
        fileNameDisplay.textContent = uploader.files.length > 0 ? uploader.files[0].name : '';
    });

    // 2. Handle the validation button click
    validateButton.addEventListener('click', async () => {
        const file = uploader.files[0];
        if (!file) {
            alert('Please select a handwritten form image to validate!');
            return;
        }

        loader.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        validateButton.disabled = true;

        const formData = new FormData();
        formData.append('handwrittenForm', file);

        try {
            const response = await fetch('/validate-handwritten-form', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            // 3. Display the results
            displayComparison(result);

        } catch (error) {
            finalResult.textContent = 'Validation Failed';
            finalResult.className = 'mismatch';
            comparisonTableBody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
        } finally {
            loader.classList.add('hidden');
            resultsContainer.classList.remove('hidden');
            validateButton.disabled = false;
        }
    });

    function displayComparison(result) {
        const overallScore = result.overallSimilarity * 100;
        if (overallScore >= 90) { // 90% is our threshold
            finalResult.textContent = `Validation Passed (Overall Match: ${overallScore.toFixed(1)}%)`;
            finalResult.className = 'match';
        } else {
            finalResult.textContent = `Discrepancies Found (Overall Match: ${overallScore.toFixed(1)}%)`;
            finalResult.className = 'mismatch';
        }

        comparisonTableBody.innerHTML = '';
        result.comparison.forEach(item => {
            const row = document.createElement('tr');
            const similarity = item.similarity * 100;
            const matchClass = similarity >= 90 ? 'match' : 'mismatch';
            row.innerHTML = `
                <td>${item.field}</td>
                <td>${item.masterValue}</td>
                <td>${item.handwrittenValue}</td>
                <td class="${matchClass}">${similarity.toFixed(1)}%</td>
            `;
            comparisonTableBody.appendChild(row);
        });
    }
});