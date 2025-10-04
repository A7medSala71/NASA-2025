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
    summary: { confirmed: 0, candidate: 0, 'false positive': 0 }
};

// CSV parsing
function parseCSV(csvString) {
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
    return { headers, data };
}

// Find best model based on headers
function findSuitableModel(headers) {
    const headerSet = new Set(headers.map(h => h.toLowerCase()).filter(h => !h.startsWith("unnamed")));
    let bestModel = null, maxMatchCount = 0;
    Object.entries(MODELS).forEach(([modelName, { features }]) => {
        const lowerFeatures = features.map(f => f.toLowerCase());
        const matchCount = lowerFeatures.filter(f => headerSet.has(f)).length;
        if (matchCount > maxMatchCount) {
            bestModel = modelName;
            maxMatchCount = matchCount;
        }
    });
    return maxMatchCount > 0 ? bestModel : null;
}

// Query Hugging Face
async function queryHuggingFace(modelKey, data) {
    const inputs = {};
    MODELS[modelKey].features.forEach(feature => {
        inputs[feature] = parseFloat(data[feature]) || 0;
    });

    if (useGradio && Client) {
        try {
            const client = await Client.connect(MODELS[modelKey].endpoint, { hf_token: HF_API_TOKEN });
            const result = await client.predict("/classify_exoplanet", inputs);
            return result.data;
        } catch (error) {
            useGradio = false;
        }
    }

    const url = `https://api-inference.huggingface.co/models/${MODELS[modelKey].endpoint}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${HF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs })
    });
    if (!response.ok) throw new Error(`Fetch API error: ${response.status}`);
    return await response.json();
}

// Process CSV for model inference
function processCSVForModel(csvString) {
    const { headers, data } = parseCSV(csvString);
    const model = findSuitableModel(headers);
    if (!model) throw new Error('No suitable model found.');
    const requiredFeatures = MODELS[model].features;
    const validRows = data.map((row, index) => {
        const missingFeatures = requiredFeatures.filter(f => !(f in row) || row[f] === null || row[f] === '');
        return { index, row, isValid: missingFeatures.length === 0, missingFeatures };
    });
    return { model, display: MODELS[model].display, data: validRows };
}

// Parse prediction result
function parsePrediction(predictions, rowData, rowIndex) {
    const result = { rowIndex: rowIndex+1, rowData, label: 'Unknown', confidence: 0, confidences: [], keyFeatures: '', explanation: 'No explanation', resultClass: '' };
    if (Array.isArray(predictions) && predictions.length >= 2) {
        const classification = predictions[1];
        if (classification.label && classification.confidences) {
            result.label = classification.label;
            result.confidence = classification.confidences.find(c=>c.label===classification.label)?.confidence || 0;
            result.confidences = classification.confidences;
            result.resultClass = classification.label.toLowerCase().replace(/ /g,'-');
        }
        if (predictions[2]) {
            const lines = predictions[2].split('\n').filter(l=>l.trim());
            const keyFeatures = [];
            let explanation = '', isExplanation=false;
            lines.forEach(line=>{
                if(line.startsWith('### Explanation:')) { isExplanation=true; explanation=line.replace('### Explanation:','').trim(); }
                else if(isExplanation) explanation+=' '+line.trim();
                else keyFeatures.push(line);
            });
            result.keyFeatures = keyFeatures.join('\n');
            result.explanation = explanation;
        }
    }
    return result;
}

// Loading overlay
function showLoadingOverlay(msg='Processing...') {
    let overlay = document.getElementById('loadingOverlay');
    if(!overlay){
        overlay=document.createElement('div');
        overlay.id='loadingOverlay';
        overlay.className='loading-overlay';
        overlay.innerHTML=`<div class="spinner"></div><p>${msg}</p>`;
        document.body.appendChild(overlay);
    } else overlay.querySelector('p').textContent=msg;
    overlay.style.display='flex';
}
function hideLoadingOverlay() {
    const overlay=document.getElementById('loadingOverlay');
    if(overlay) overlay.style.display='none';
}

// Toast
function showToast(message, type="success") {
    let container=document.getElementById("toastContainer
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.right = "20px";
        container.style.zIndex = "9999";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.style.background = type === "success" ? "#4CAF50" : type === "warning" ? "#ff9800" : "#f44336";
    toast.style.color = "#fff";
    toast.style.padding = "10px 20px";
    toast.style.marginTop = "10px";
    toast.style.borderRadius = "5px";
    toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    toast.style.fontSize = "14px";
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// Display output in table
function displayResults(results) {
    outputContent.innerHTML = "";
    if (!results || results.length === 0) {
        outputContent.innerHTML = "<p>No results found.</p>";
        return;
    }

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    const headerRow = document.createElement("tr");

    Object.keys(results[0]).forEach(key => {
        const th = document.createElement("th");
        th.textContent = key;
        th.style.border = "1px solid #ddd";
        th.style.padding = "8px";
        th.style.background = "#f2f2f2";
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    results.forEach(result => {
        const row = document.createElement("tr");
        Object.values(result).forEach(value => {
            const td = document.createElement("td");
            td.style.border = "1px solid #ddd";
            td.style.padding = "8px";
            td.textContent = typeof value === "object" ? JSON.stringify(value) : value;
            row.appendChild(td);
        });
        table.appendChild(row);
    });

    outputContent.appendChild(table);
}

// Handle file upload
fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            showLoadingOverlay("Processing CSV...");
            const csvString = event.target.result;
            const { model, display, data } = processCSVForModel(csvString);
            currentEndpoint = MODELS[model].endpoint;
            bulkResults.model = model;
            bulkResults.display = display;
            bulkResults.results = [];
            bulkResults.summary = { confirmed: 0, candidate: 0, "false positive": 0 };

            for (let i = 0; i < data.length; i++) {
                const rowObj = data[i];
                if (!rowObj.isValid) continue;
                const prediction = await queryHuggingFace(model, rowObj.row);
                const parsed = parsePrediction(prediction, rowObj.row, rowObj.index);
                bulkResults.results.push(parsed);
                if (parsed.label.toLowerCase() in bulkResults.summary) {
                    bulkResults.summary[parsed.label.toLowerCase()] += 1;
                }
            }

            hideLoadingOverlay();
            displayResults(bulkResults.results);
            showToast(`Finished processing CSV with model: ${display}`, "success");
        } catch (err) {
            hideLoadingOverlay();
            console.error(err);
            showToast(err.message, "error");
        }
    };
    reader.readAsText(file);
});

// Sample button handlers
sampleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        const sampleKey = btn.dataset.sample;
        if (!SAMPLE_CSV[sampleKey]) return;
        fileInput.value = null; // Reset
        const blob = new Blob([SAMPLE_CSV[sampleKey]], { type: "text/csv" });
        const fakeFile = new File([blob], `${sampleKey}.csv`, { type: "text/csv" });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(fakeFile);
        fileInput.files = dataTransfer.files;
        const event = new Event("change");
        fileInput.dispatchEvent(event);
    });
});

// Navigation buttons
getStartedBtn?.addEventListener("click", () => {
    homeContent.style.display = "none";
    dashboardContent.style.display = "block";
});

backBtn?.addEventListener("click", () => {
    dashboardContent.style.display = "none";
    homeContent.style.display = "block";
});

learnMoreBtn?.addEventListener("click", () => {
    dashboardContent.style.display = "none";
    aboutContent.style.display = "block";
});

aboutBackBtn?.addEventListener("click", () => {
    aboutContent.style.display = "none";
    dashboardContent.style.display = "block";
});

// Initialize Gradio client on load
initializeGradioClient();
