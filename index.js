let Client;
let useGradio = true;
let currentEndpoint = '';  // New variable to store the current model's endpoint

// Load Gradio client
async function initializeGradioClient() {
    try {
        Client = (await import('https://cdn.jsdelivr.net/npm/@gradio/client/+esm')).Client;
        console.log('Gradio client imported successfully from CDN');
    } catch (error) {
        console.error('Failed to import @gradio/client:', error);
        useGradio = false;
        showToast('Failed to load Gradio client. Falling back to direct API call.', 'warning');
    }
}

// DOM elements
const getStartedBtn = document.getElementById('getStartedBtn');
const backBtn = document.getElementById('backBtn');
const homeContent = document.getElementById('homeContent');
const dashboardContent = document.getElementById('dashboardContent');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const sampleBtns = document.querySelectorAll('.sample-btn');
const learnMoreBtn = document.querySelector('.btn-secondary');
const aboutContent = document.getElementById('aboutContent');
const aboutBackBtn = document.getElementById('aboutBackBtn');
const outputContent = document.getElementById('outputContent');
const outputBackBtn = document.getElementById('outputBackBtn');

// Hugging Face API token
const HF_API_TOKEN = "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";

// Model feature definitions
const MODELS = {
    koi: {
        features: [
            'koi_fpflag_nt', 'koi_fpflag_ss', 'koi_fpflag_co', 'koi_fpflag_ec',
            'koi_period', 'koi_duration', 'koi_depth', 'koi_impact', 'koi_model_snr',
            'koi_steff', 'koi_slogg', 'koi_srad', 'koi_kepmag'
        ],
        display: 'Kepler (KOI)',
        endpoint: 'am0fares/Kepler-Exoplanet-Classifer'
    },
    tess: {
        features: [
            'pl_orbper', 'pl_trandurh', 'pl_trandep', 'pl_rade', 'pl_insol', 'pl_eqt',
            'st_tmag', 'st_dist', 'st_teff', 'st_logg', 'st_rad'
        ],
        display: 'TESS',
        endpoint: 'am0fares/Exoplanet-classifier'
    },
    k2: {
        features: [
            'sy_pnum', 'default_flag', 'rv_flag', 'pl_ratror', 'pl_nnotes',
            'sy_hmag', 'sy_kmag', 'sy_gaiamagerr1', 'sy_gaiamagerr2', 'sy_jmag',
            'sy_dist', 'sy_w1mag', 'sy_tmag', 'sy_plx', 'sy_w2mag', 'sy_kepmag',
            'sy_gaiamag', 'sy_w3mag', 'pl_radjerr2'
        ],
        display: 'K2',
        endpoint: 'am0fares/k2-nasa-2025'
    }
};

// Sample CSV data for testing
const SAMPLE_CSV = {
    kepler: `"koi_fpflag_nt","koi_fpflag_ss","koi_fpflag_co","koi_fpflag_ec","koi_period","koi_duration","koi_depth","koi_impact","koi_model_snr","koi_steff","koi_slogg","koi_srad","koi_kepmag"
0,0,0,0,10.123,2.5,500.0,0.3,50.0,5800,4.5,1.0,14.5
0,1,0,0,15.234,3.2,450.0,0.4,45.0,5900,4.6,1.1,14.2
1,0,0,0,8.567,2.1,550.0,0.2,55.0,5700,4.4,0.9,14.8`,
    tess: `"pl_orbper","pl_trandurh","pl_trandep","pl_rade","pl_insol","pl_eqt","st_tmag","st_dist","st_teff","st_logg","st_rad"
12.345,3.0,600.0,2.5,100.0,800,15.0,200.0,5500,4.2,0.9
20.456,4.5,700.0,3.0,120.0,850,15.5,250.0,5600,4.3,1.0
8.789,2.2,550.0,2.0,90.0,750,14.8,180.0,5400,4.1,0.8`,
    k2: `"label","sy_pnum","default_flag","rv_flag","pl_ratror","pl_nnotes","sy_hmag","sy_kmag","sy_gaiamagerr1","sy_gaiamagerr2","sy_jmag","sy_dist","sy_w1mag","sy_tmag","sy_plx","sy_w2mag","sy_kepmag","sy_gaiamag","sy_w3mag","pl_radjerr2"
0,1,1,0,0.02,0,10.0,9.5,0.01,0.01,10.5,150.0,8.0,14.0,5.0,8.5,14.5,14.2,7.5,0.1
0,2,1,0,0.03,1,10.5,9.8,0.02,0.02,11.0,160.0,8.2,14.2,5.2,8.7,14.7,14.4,7.7,0.2
0,1,0,1,0.025,0,9.8,9.2,0.01,0.01,10.2,140.0,7.8,13.8,4.8,8.3,14.3,14.0,7.3,0.15`
};

// Store bulk results
let bulkResults = {
    model: '',
    display: '',
    results: [],
    summary: {
        confirmed: 0,
        candidate: 0,
        'false positive': 0
    }
};

// Parse CSV string into headers and data
function parseCSV(csvString) {
    console.log('Parsing CSV...');
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/g;
    const lines = csvString.trim().split(/\r?\n/);
    const headers = lines[0].split(regex).map(h => h.replace(/^"|"$/g, '').trim());
    const data = lines.slice(1).map(line => {
        const values = line.split(regex).map(v => v.replace(/^"|"$/g, '').trim());
        return headers.reduce((obj, header, index) => {
            obj[header] = values[index] || null;
            return obj;
        }, {});
    });
    console.log('CSV parsed:', { headers, dataRows: data.length });
    return { headers, data };
}

// Find the best model based on CSV headers
function findSuitableModel(headers) {
    console.log('Finding suitable model for headers:', headers);
    const headerSet = new Set(headers.map(h => h.toLowerCase()).filter(h => !h.startsWith("unnamed")));
    let bestModel = null;
    let maxMatchCount = 0;

    Object.entries(MODELS).forEach(([modelName, { features }]) => {
        const lowerFeatures = features.map(f => f.toLowerCase());
        const matchCount = lowerFeatures.filter(f => headerSet.has(f)).length;
        if (matchCount > maxMatchCount) {
            bestModel = modelName;
            maxMatchCount = matchCount;
        }
    });

    console.log('Selected model:', bestModel);
    return maxMatchCount > 0 ? bestModel : null;
}

// Query Hugging Face API
async function queryHuggingFace(modelKey, data) {
    const inputs = {};
    MODELS[modelKey].features.forEach(feature => {
        inputs[feature] = parseFloat(data[feature]) || 0;
    });
    console.log('Prepared inputs for API:', inputs);

    if (useGradio && Client) {
        try {
            console.log('Attempting Gradio client connection to:', MODELS[modelKey].endpoint);
            const client = await Client.connect(MODELS[modelKey].endpoint, {
                hf_token: HF_API_TOKEN
            });
            console.log('Gradio client connected');
            const result = await client.predict("/classify_exoplanet", inputs);
            console.log('Gradio API response:', result.data);
            return result.data;
        } catch (error) {
            console.error('Gradio client error:', error);
            showToast('Gradio client failed. Falling back to direct API call.', 'warning');
            useGradio = false;
        }
    }

    console.log('Using fetch fallback for API call');
    try {
        const url = `https://api-inference.huggingface.co/models/${MODELS[modelKey].endpoint}`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ inputs })
        });

        if (!response.ok) {
            throw new Error(`Fetch API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('Fetch API response:', result);
        return result;
    } catch (error) {
        console.error('Fetch API error:', error);
        throw new Error(`Hugging Face API error: ${error.message}`);
    }
}

// Process CSV for model inference - now handles multiple rows
function processCSVForModel(csvString) {
    const { headers, data } = parseCSV(csvString);
    const model = findSuitableModel(headers);

    if (!model) {
        throw new Error('No suitable model found for the provided CSV features.');
    }

    if (data.length === 0) {
        throw new Error('CSV file contains no data rows.');
    }

    // Validate that all rows have required features
    const requiredFeatures = MODELS[model].features;
    const validRows = data.map((row, index) => {
        const missingFeatures = requiredFeatures.filter(
            feature => !(feature in row) || row[feature] === null || row[feature] === ''
        );
        return {
            index,
            row,
            isValid: missingFeatures.length === 0,
            missingFeatures
        };
    });

    return {
        model: model,
        display: MODELS[model].display,
        data: validRows
    };
}

// Parse explanation text from model
function parseExplanation(explanationText) {
    const lines = explanationText.split('\n').filter(line => line.trim());
    let keyFeatures = [];
    let explanation = '';
    let isExplanationSection = false;

    lines.forEach(line => {
        if (line.startsWith('### Explanation:')) {
            isExplanationSection = true;
            explanation = line.replace('### Explanation:', '').trim();
        } else if (isExplanationSection) {
            explanation += ' ' + line.trim();
        } else if (line.startsWith('- **')) {
            const match = line.match(/- \*\*([^\*]+)\*\*: value = ([^,]+), gain = ([^\(]+)\((.+)\)/);
            if (match) {
                keyFeatures.push(`${match[1]}: Value = ${match[2]}, Gain = ${match[3].trim()} (${match[4]})`);
            } else {
                keyFeatures.push(line);
            }
        }
    });

    explanation = explanation.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');

    return {
        keyFeatures: keyFeatures.join('\n'),
        explanation: explanation.trim() || 'No explanation provided.'
    };
}

// Parse prediction results
function parsePrediction(predictions, rowData, rowIndex) {
    let result = {
        rowIndex: rowIndex + 1,
        rowData: rowData,
        label: 'Unknown',
        confidence: 0,
        confidences: [],
        keyFeatures: '',
        explanation: 'No explanation provided.',
        resultClass: ''
    };

    if (Array.isArray(predictions) && predictions.length >= 2) {
        const classification = predictions[1];
        if (classification.label && classification.confidences) {
            result.label = classification.label;
            result.confidence = classification.confidences.find(c => c.label === classification.label)?.confidence || 0;
            result.confidences = classification.confidences;
            result.resultClass = classification.label.toLowerCase().replace(/ /g, '-');
        }

        if (predictions[2]) {
            const parsed = parseExplanation(predictions[2]);
            result.keyFeatures = parsed.keyFeatures;
            result.explanation = parsed.explanation;
        }
    }

    return result;
}

// Show loading overlay
function showLoadingOverlay(message = 'Processing...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="spinner"></div>
            <p>${message}</p>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector('p').textContent = message;
    }
    overlay.style.display = 'flex';
}

// Hide loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Handle CSV input (file or sample) - now processes all rows
async function handleCSVInput(csvString, source = 'file') {
    console.time('Processing');
    console.log('Handling CSV input from:', source);
    
    try {
        const { model, display, data } = processCSVForModel(csvString);
        currentEndpoint = MODELS[model].endpoint;  // Set the current endpoint here

        // Check for invalid rows and show warning
        const invalidRows = data.filter(row => !row.isValid);
        if (invalidRows.length > 0) {
            const invalidRowNumbers = invalidRows.map(row => row.index + 1).join(', ');
            showToast(`Warning: Rows ${invalidRowNumbers} contain missing data and will be skipped.`, 'warning');
        }
        
        // Check if it's a single row - handle differently
        if (data.length === 1) {
            const singleRow = data[0];
            if (!singleRow.isValid) {
                throw new Error(`Row 1 is missing required features: ${singleRow.missingFeatures.join(', ')}`);
            }

            showLoadingOverlay('Analyzing single row...');

            try {
                const predictions = await queryHuggingFace(model, singleRow.row);
                const result = parsePrediction(predictions, singleRow.row, 0);
                
                // Show single result directly (no bulk view)
                showSingleResultDirect(result, display);
                showToast('Analysis complete!', 'success');
            } catch (error) {
                console.error('Error processing row:', error);
                showToast(error.message, 'error');
            } finally {
                hideLoadingOverlay();
            }
            
            console.timeEnd('Processing');
            return;
        }
        
        // Reset bulk results for multiple rows
        bulkResults = {
            model: model,
            display: display,
            results: [],
            summary: {
                confirmed: 0,
                candidate: 0,
                'false positive': 0
            }
        };

        // Show bulk summary view immediately
        showBulkSummary(display, data.length);

        // Process each row
        for (let i = 0; i < data.length; i++) {
            const rowData = data[i];
            
            if (!rowData.isValid) {
                console.warn(`Skipping row ${i + 1}: Missing features`);
                continue;
            }

            try {
                const predictions = await queryHuggingFace(model, rowData.row);
                const result = parsePrediction(predictions, rowData.row, i);
                bulkResults.results.push(result);
                
                // Update summary
                const label = result.label.toLowerCase();
                if (label.includes('confirmed')) {
                    bulkResults.summary.confirmed++;
                } else if (label.includes('candidate')) {
                    bulkResults.summary.candidate++;
                } else if (label.includes('false')) {
                    bulkResults.summary['false positive']++;
                }

                // Update the display
                updateBulkSummary();
                
            } catch (error) {
                console.error(`Error processing row ${i + 1}:`, error);
            }

            // Small delay to avoid rate limiting
            if (i < data.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Hide processing status after all rows are processed
        const processingStatus = document.getElementById('processingStatus');
        if (processingStatus) {
            processingStatus.style.display = 'none';
        }

        showToast(`Analysis complete! Processed ${bulkResults.results.length} rows.`, 'success');
        
    } catch (error) {
        console.error('Error in handleCSVInput:', error);
        showToast(error.message, 'error');
    }
    console.timeEnd('Processing');
}

// Show bulk summary view
function showBulkSummary(modelDisplay, totalRows) {
    console.log('Showing bulk summary for model:', modelDisplay);
    homeContent.classList.remove('active');
    dashboardContent.classList.remove('active');
    aboutContent.classList.remove('active');
    outputContent.classList.add('active');
    outputContent.style.display = 'block';

    // Hide hyperparameters and results panels
    // const hyperparam = document.querySelector('.hyperparam-panel');
    // const resultsPanel = document.querySelector('.results-panel');
    // if (hyperparam) hyperparam.style.display = 'none';
    // if (resultsPanel) resultsPanel.style.display = 'none';

    // Hide other views
    const detailView = document.getElementById('bulkDetailView');
    const singleView = document.getElementById('singleResultView');
    if (detailView) detailView.style.display = 'none';
    if (singleView) singleView.style.display = 'none';

    // Create or update bulk summary view
    let bulkView = document.getElementById('bulkSummaryView');
    if (!bulkView) {
        bulkView = document.createElement('div');
        bulkView.id = 'bulkSummaryView';
        bulkView.className = 'bulk-summary-view';
        document.querySelector('.output-body').appendChild(bulkView);
    }

    bulkView.innerHTML = `
        <p class="bulk-subtitle">Model: ${modelDisplay} | Total Rows: ${totalRows}</p>
        
        <div class="summary-cards">
            <div class="summary-card confirmed-card" data-category="confirmed">
                <div class="card-icon">✓</div>
                <div class="card-label">Confirmed Exoplanets</div>
                <div class="card-count" id="confirmedCount">0</div>
                <div class="card-action">Click to view details</div>
            </div>
            
            <div class="summary-card candidate-card" data-category="candidate">
                <div class="card-icon">?</div>
                <div class="card-label">Candidates</div>
                <div class="card-count" id="candidateCount">0</div>
                <div class="card-action">Click to view details</div>
            </div>
            
            <div class="summary-card false-positive-card" data-category="false positive">
                <div class="card-icon">✗</div>
                <div class="card-label">False Positives</div>
                <div class="card-count" id="falsePositiveCount">0</div>
                <div class="card-action">Click to view details</div>
            </div>
        </div>
        
        <div class="processing-status" id="processingStatus">
            <div class="spinner"></div>
            <p>Processing rows... This may take a few minutes.</p>
        </div>
    `;

    bulkView.style.display = 'block';

    // Add click listeners to cards
    const cards = bulkView.querySelectorAll('.summary-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const category = card.dataset.category;
            const count = bulkResults.summary[category];
            if (count > 0) {
                showBulkDetails(category);
            } else {
                showToast(`No ${category} results yet`, 'warning');
            }
        });
    });
}

// Update bulk summary counts
function updateBulkSummary() {
    const confirmedEl = document.getElementById('confirmedCount');
    const candidateEl = document.getElementById('candidateCount');
    const falsePositiveEl = document.getElementById('falsePositiveCount');
    
    if (confirmedEl) confirmedEl.textContent = bulkResults.summary.confirmed;
    if (candidateEl) candidateEl.textContent = bulkResults.summary.candidate;
    if (falsePositiveEl) falsePositiveEl.textContent = bulkResults.summary['false positive'];
}

// Show detailed results for a category
function showBulkDetails(category) {
    console.log('Showing details for category:', category);
    
    // Filter results by category
    const filteredResults = bulkResults.results.filter(r => {
        const label = r.label.toLowerCase();
        if (category === 'confirmed') return label.includes('confirmed');
        if (category === 'candidate') return label.includes('candidate');
        if (category === 'false positive') return label.includes('false');
        return false;
    });

    if (filteredResults.length === 0) {
        showToast(`No results for ${category}`, 'warning');
        return;
    }

    // Hide summary view
    const summaryView = document.getElementById('bulkSummaryView');
    if (summaryView) summaryView.style.display = 'none';

    const singleView = document.getElementById('singleResultView');
    if (singleView) singleView.style.display = 'none';

    // Create or update detail view
    let detailView = document.getElementById('bulkDetailView');
    if (!detailView) {
        detailView = document.createElement('div');
        detailView.id = 'bulkDetailView';
        detailView.className = 'bulk-detail-view';
        document.querySelector('.output-body').appendChild(detailView);
    }

    detailView.innerHTML = `
        <h2 class="detail-title">${category.charAt(0).toUpperCase() + category.slice(1)} Results</h2>
        <p class="detail-subtitle">Found ${filteredResults.length} result(s)</p>
        
        <div class="results-table">
            <table>
                <thead>
                    <tr>
                        <th>Row #</th>
                        <th>Classification</th>
                        <th>Confidence</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredResults.map(result => `
                        <tr class="result-row" data-row-index="${result.rowIndex}">
                            <td>${result.rowIndex}</td>
                            <td><span class="label-badge ${result.resultClass}">${result.label}</span></td>
                            <td>${(result.confidence * 100).toFixed(2)}%</td>
                            <td><button class="view-btn" data-row-index="${result.rowIndex}" data-category="${category}">View Details</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    detailView.style.display = 'block';

    // Add click listeners to view buttons
    const viewBtns = detailView.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const rowIndex = parseInt(btn.dataset.rowIndex);
            const category = btn.dataset.category;
            showSingleResult(rowIndex, category);
        });
    });
}

// Show single result details
function showSingleResult(rowIndex, category) {
    console.log('Showing single result for row:', rowIndex);
    
    const result = bulkResults.results.find(r => r.rowIndex === rowIndex);
    if (!result) {
        showToast('Result not found', 'error');
        return;
    }

    // Hide detail view
    const detailView = document.getElementById('bulkDetailView');
    if (detailView) detailView.style.display = 'none';

    const summaryView = document.getElementById('bulkSummaryView');
    if (summaryView) summaryView.style.display = 'none';

    // Create or update single result view
    let singleView = document.getElementById('singleResultView');
    if (!singleView) {
        singleView = document.createElement('div');
        singleView.id = 'singleResultView';
        singleView.className = 'single-result-view';
        document.querySelector('.output-body').appendChild(singleView);
    }

    singleView.dataset.category = category;

    singleView.innerHTML = `
        <h2 class="single-result-title">Row ${result.rowIndex} Details</h2>
        
        <div class="single-result-content">
            <div class="result-section">
                <h2 class="result-title">Prediction Result</h2>
                <p class="result-status ${result.resultClass}">${result.label} (${(result.confidence * 100).toFixed(2)}%)</p>
                
                <div class="confidence-breakdown">
                    <h3>Confidence Breakdown:</h3>
                    ${result.confidences.map(c => `
                        <div class="confidence-bar">
                            <span class="confidence-label">${c.label}</span>
                            <div class="confidence-progress">
                                <div class="confidence-fill" style="width: ${(c.confidence * 100).toFixed(2)}%"></div>
                            </div>
                            <span class="confidence-value">${(c.confidence * 100).toFixed(2)}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="explanation-section">
                <h3>Key Features Supporting This Prediction:</h3>
                <pre id="detailedExplanationText">${result.keyFeatures || 'No key features available.'}</pre>

                <h3>Explanation:</h3>
                <p id="modelExplanationText">${result.explanation}</p>
            </div>
        </div>
    `;

    singleView.style.display = 'block';
}

// Show single result directly (for single-row CSV)
function showSingleResultDirect(result, modelDisplay) {
    console.log('Showing single result directly');
    
    homeContent.classList.remove('active');
    dashboardContent.classList.remove('active');
    aboutContent.classList.remove('active');
    outputContent.classList.add('active');
    outputContent.style.display = 'block';

    // Hide hyperparameters and results panels and bulk views
    // const hyperparam = document.querySelector('.hyperparam-panel');
    // const resultsPanel = document.querySelector('.results-panel');
    const summaryView = document.getElementById('bulkSummaryView');
    const detailView = document.getElementById('bulkDetailView');
    
    // if (hyperparam) hyperparam.style.display = 'none';
    // if (resultsPanel) resultsPanel.style.display = 'none';
    if (summaryView) summaryView.style.display = 'none';
    if (detailView) detailView.style.display = 'none';

    // Create or update single result view
    let singleView = document.getElementById('singleResultView');
    if (!singleView) {
        singleView = document.createElement('div');
        singleView.id = 'singleResultView';
        singleView.className = 'single-result-view';
        document.querySelector('.output-body').appendChild(singleView);
    }

    singleView.dataset.category = 'direct'; // Mark as direct (not from bulk)

    singleView.innerHTML = `
        
        <div class="single-result-content">
            <div class="result-section">
                <h2 class="result-title">Prediction Result</h2>
                <p class="result-status ${result.resultClass}">${result.label} (${(result.confidence * 100).toFixed(2)}%)</p>
                
                <div class="confidence-breakdown">
                    <h3>Confidence Breakdown:</h3>
                    ${result.confidences.map(c => `
                        <div class="confidence-bar">
                            <span class="confidence-label">${c.label}</span>
                            <div class="confidence-progress">
                                <div class="confidence-fill" style="width: ${(c.confidence * 100).toFixed(2)}%"></div>
                            </div>
                            <span class="confidence-value">${(c.confidence * 100).toFixed(2)}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="explanation-section">
                <h3>Key Features Supporting This Prediction:</h3>
                <pre id="detailedExplanationText">${result.keyFeatures || 'No key features available.'}</pre>

                <h3>Explanation:</h3>
                <p id="modelExplanationText">${result.explanation}</p>
            </div>
        </div>
    `;

    singleView.style.display = 'block';
}

// Show toast notification
function showToast(message, type = "success") {
    console.log('Showing toast:', message, type);
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 5000);
}

// Event listeners
initializeGradioClient();

getStartedBtn.addEventListener('click', (e) => {
    e.preventDefault();
    homeContent.style.display = 'none';
    dashboardContent.classList.add('active');
});

backBtn.addEventListener('click', () => {
    dashboardContent.classList.remove('active');
    setTimeout(() => {
        homeContent.style.display = 'block';
    }, 300);
});

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        console.log('File selected:', file.name);
        showToast(`File "${file.name}" selected! Running analysis...`);
        handleUploadedFile(file);
    }
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
        console.log('File dropped:', file.name);
        showToast(`File "${file.name}" dropped! Running analysis...`);
        handleUploadedFile(file);
    }
});

sampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const sample = btn.dataset.sample;
        console.log(`Loading ${sample} sample data...`);
        if (SAMPLE_CSV[sample]) {
            showToast(`Loading ${sample.toUpperCase()} sample data...`);
            handleCSVInput(SAMPLE_CSV[sample], `${sample.toUpperCase()} sample`);
        } else {
            showToast(`No sample data available for ${sample.toUpperCase()}.`, 'error');
        }
    });
});

learnMoreBtn.addEventListener('click', (e) => {
    e.preventDefault();
    homeContent.style.display = 'none';
    dashboardContent.classList.remove('active');
    aboutContent.classList.add('active');
});

aboutBackBtn.addEventListener('click', () => {
    aboutContent.classList.remove('active');
    setTimeout(() => {
        homeContent.style.display = 'block';
    }, 300);
});

outputBackBtn.addEventListener('click', () => {
    const bulkSummaryView = document.getElementById('bulkSummaryView');
    const bulkDetailView = document.getElementById('bulkDetailView');
    const singleResultView = document.getElementById('singleResultView');

    if (singleResultView && singleResultView.style.display !== 'none') {
        const category = singleResultView.dataset.category;
        
        // If it's a direct single result (not from bulk), go back to dashboard
        if (category === 'direct') {
            outputContent.classList.remove('active');
            outputContent.style.display = 'none';
            singleResultView.style.display = 'none';
            setTimeout(() => {
                dashboardContent.classList.add('active');
            }, 300);
        } else {
            // From single result → back to detail view
            if (category) {
                showBulkDetails(category);
            }
        }
    } else if (bulkDetailView && bulkDetailView.style.display !== 'none') {
        // From detail view → back to summary
        bulkDetailView.style.display = 'none';
        if (bulkSummaryView) bulkSummaryView.style.display = 'block';
    } else {
        // From summary → back to dashboard
        outputContent.classList.remove('active');
        outputContent.style.display = 'none';
        setTimeout(() => {
            dashboardContent.classList.add('active');
        }, 300);
    }
});

function handleUploadedFile(file) {
    console.log('Handling uploaded file:', file.name);
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showToast('Please upload a valid CSV file.', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        const csvString = e.target.result;
        handleCSVInput(csvString, file.name);
    };
    reader.onerror = function () {
        console.error('Error reading file:', file.name);
        showToast('Error reading file!', 'error');
    };
    reader.readAsText(file);
}

function bindSliderToValue(sliderId, valueId) {
    const slider = document.getElementById(sliderId);
    const valueSpan = document.getElementById(valueId);

    if (slider && valueSpan) {
        valueSpan.textContent = slider.value;
        slider.addEventListener("input", () => {
            valueSpan.textContent = slider.value;
        });
    }
}

// Bind sliders
bindSliderToValue("nEstimators", "nEstimatorsValue");
bindSliderToValue("numLeaves", "numLeavesValue");

// Apply button event
const applyBtn = document.getElementById("applyParamsBtn");
if (applyBtn) {
    applyBtn.addEventListener("click", async () => {
        const params = {
            n_estimators: parseInt(document.getElementById("nEstimators").value),
            learning_rate: parseFloat(document.getElementById("learningRate").value),
            num_leaves: parseInt(document.getElementById("numLeaves").value),
            max_depth: parseInt(document.getElementById("maxDepth").value),
            // reg_alpha and reg_lambda are ignored as they are not part of the API
        };

        console.log("Applying Hyperparameters:", params);

        if (!currentEndpoint) {
            showToast("No model selected. Please upload data first.", 'error');
            return;
        }

        if (useGradio && Client) {
            try {
                const client = await Client.connect(currentEndpoint, {
                    hf_token: HF_API_TOKEN
                });
                const result = await client.predict("/update_hyperparams", {
                    num_leaves: params.num_leaves,
                    max_depth: params.max_depth,
                    learning_rate: params.learning_rate,
                    n_estimators: params.n_estimators,
                });
                showToast(`Model updated successfully! ${result}`, 'success');
            } catch (error) {
                console.error('Error updating hyperparameters:', error);
                showToast('Failed to update model hyperparameters.', 'error');
            }
        } else {
            showToast('Gradio client not available. Cannot update hyperparameters.', 'error');
        }
    });
}