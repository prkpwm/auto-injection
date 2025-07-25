let replacements = {};
let matchedPattern = '';
let configSets = {};
let suiteName = localStorage.getItem('lastSuite') || "suite1";
let configs = {};

const statusEl = document.getElementById('status');
let layer2Keys = []

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', loadConfig);
document.getElementById('replaceBtn').addEventListener('click', applyContentScript);
document.getElementById('saveBtn').addEventListener('click', saveChanges);
document.getElementById('exportBtn').addEventListener('click', exportConfig);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', importConfig);
document.getElementById('createConfigBtn').addEventListener('click', createNewConfig);
document.getElementById('newSuiteBtn').addEventListener('click', addNewSuite); // Added new event listener

// Dynamic dropdown suite switch
document.addEventListener('change', (event) => {
    if (event.target.id === 'myDropdown') {
        suiteName = event.target.value;
        localStorage.setItem('lastSuite', suiteName);
        // When suite changes, ensure we update the `replacements` variable
        // from the `configs` object using the `matchedPattern` and new `suiteName`.
        if (configs[matchedPattern] && configs[matchedPattern][suiteName]) {
            replacements = configs[matchedPattern][suiteName];
        } else {
            replacements = {}; // If the suite doesn't exist for this pattern, clear replacements
        }
        renderReplacements();
        showStatus(`Suite switched to "${suiteName}"`);
    }
});

// Delegated event listener for add/remove buttons on the replacement list
document.getElementById('replacementList').addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-btn');
    if (removeButton) {
        const index = removeButton.dataset.index;
        const key = Object.keys(replacements)[index];
        delete replacements[key];
        renderReplacements();
        return;
    }

    const addButton = event.target.closest('.add-btn');
    if (addButton) {
        const newKey = document.getElementById('newKey').value.trim();
        const newValue = document.getElementById('newValue').value.trim();
        if (newKey) {
            replacements[newKey] = newValue;
            renderReplacements();
        }
    }
});

// --- CORE FUNCTIONS ---
function showStatus(message, isError = false, duration = 2500) {
    statusEl.textContent = message;
    statusEl.className = `status-message ${isError ? 'error' : ''} visible`;
    setTimeout(() => {
        statusEl.classList.remove('visible');
    }, duration);
}

async function loadConfig() {
    const { urlConfigs } = await chrome.storage.local.get('urlConfigs');
    configs = urlConfigs || {};
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.startsWith('http')) {
        renderUI(null);
        return;
    }

    const url = tab.url;
    matchedPattern = '';
    replacements = {};
    layer2Keys = []; // Reset layer2Keys for each load

    for (const [pattern, configSet] of Object.entries(configs)) {
        try {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            const regex2 = new RegExp('^' + pattern.slice(0, -2) + '$');
            if (regex.test(url) || regex2.test(url)) {
                matchedPattern = pattern;
                configSets = configSet; // Store the entire configSet for the matched pattern
                layer2Keys = Object.keys(configSet);

                // Determine the suite to load: preferred suiteName, or the first available suite
                if (configSet[suiteName]) {
                    replacements = configSet[suiteName];
                } else if (layer2Keys.length > 0) {
                    suiteName = layer2Keys[0]; // Set suiteName to the first available suite
                    localStorage.setItem('lastSuite', suiteName);
                    replacements = configSet[suiteName];
                } else {
                    replacements = {}; // No suites found for this pattern
                }
                break;
            }
        } catch (e) {
            console.error(`Invalid regex pattern in config: ${pattern}`);
        }
    }
    
    renderUI(tab);
}

function renderUI(tab) {
    const configInfoEl = document.getElementById('config-info');
    const newConfigAreaEl = document.getElementById('new-config-area');
    const tableContainerEl = document.querySelector('.table-container');
    const actionsEl = document.querySelector('.actions');
    const replaceBtnEl = document.getElementById('replaceBtn');

    if (matchedPattern) {
        const optionsHtml = layer2Keys.map(key =>
            `<option value="${key}" ${key === suiteName ? 'selected' : ''}>${key}</option>`
        ).join('');

        configInfoEl.innerHTML = `
      <label for="matchedPatternInput" style="display:block; margin-bottom: 4px;"><strong>Editing config for URL:</strong></label>
      <input type="text" id="matchedPatternInput" value="${matchedPattern}" style="width: 95%;" placeholder="e.g., https://*.example.com/*">

      <label for="myDropdown" class="dropdown-label">
        Select suite:
      </label>
      <select
        id="myDropdown"
      >
        ${optionsHtml}
      </select>
   
    `;

        configInfoEl.style.display = 'block';
        tableContainerEl.style.display = 'block';
        actionsEl.style.display = 'flex';
        newConfigAreaEl.style.display = 'none';
        replaceBtnEl.disabled = false;
        renderReplacements();
    } else {
        configInfoEl.style.display = 'none';
        tableContainerEl.style.display = 'none';
        actionsEl.style.display = 'none';
        replaceBtnEl.disabled = true;

        if (tab) {
            newConfigAreaEl.style.display = 'block';
            const urlObject = new URL(tab.url);
            document.getElementById('newUrlPatternInput').value = `${urlObject.protocol}//${urlObject.hostname}/*`;
        } else {
            newConfigAreaEl.style.display = 'none';
            showStatus('Cannot add config for this page.', true);
        }
    }
}

function renderReplacements() {
    const container = document.getElementById('replacementList');
    container.innerHTML = '';


    const header = document.createElement('div');
    header.className = 'table-header';
    header.innerHTML = `
        <div>Key (Placeholder)</div>
        <div>Value (Replacement)</div>
        <div>Action</div>
    `;
    container.appendChild(header);


    Object.entries(replacements).forEach(([key, value], index) => {
        const row = createReplacementRow(key, value, index);
        container.appendChild(row);
    });


    const newRow = createReplacementRow('', '', null, true);
    container.appendChild(newRow);
}

function createReplacementRow(key, value, index, isNew = false) {
    const row = document.createElement('div');
    row.className = 'replacement-row';

    if (!isNew) {
        row.innerHTML = `
            <div><input type="text" class="key" value="${key}" placeholder="URL Placeholder"></div>
            <div><input type="text" class="value" value="${value}" placeholder="Replacement Value"></div>
            <button class="icon-btn remove-btn" data-index="${index}" title="Remove">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#d9534f" width="20" height="20"><path d="M7 21C6.45 21 5.979 20.804 5.587 20.412C5.195 20.02 5 19.55 5 19V6H4V4H9V3H15V4H20V6H19V19C19 19.55 18.804 20.021 18.412 20.413C18.02 20.805 17.55 21 17 21H7Z"/></svg>
            </button>
        `;
    } else {
        row.innerHTML = `
            <div><input type="text" id="newKey" placeholder="New Key"></div>
            <div><input type="text" id="newValue" placeholder="New Value"></div>
            <button class="icon-btn add-btn" title="Add">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4caf50" width="20" height="20"><path d="M11 19V13H5V11H11V5H13V11H19V13H13V19H11Z"/></svg>
            </button>
        `;
    }
    return row;
}


// --- ACTION HANDLERS ---

async function createNewConfig() {
    const newPattern = document.getElementById('newUrlPatternInput').value.trim();
    if (!newPattern) {
        showStatus('URL pattern cannot be empty.', true);
        return;
    }


    try {
        new RegExp(newPattern.replace(/\*/g, '.*'));
    } catch (e) {
        showStatus('The provided pattern is invalid.', true);
        return;
    }

    const { urlConfigs } = await chrome.storage.local.get('urlConfigs');
    const configs = urlConfigs || {};

    if (configs[newPattern]) {
        showStatus('A configuration with this exact pattern already exists.', true);
        return;
    }

    configs[newPattern] = {suite1:{}};
    await chrome.storage.local.set({ urlConfigs: configs });
    showStatus('New configuration created successfully!');
    await loadConfig();
}

async function addNewSuite() {
    if (!matchedPattern) {
        showStatus('Please select or create a URL configuration first.', true);
        return;
    }

    const newSuiteName = prompt('Enter the name for the new suite:');
    if (!newSuiteName || newSuiteName.trim() === '') {
        showStatus('Suite name cannot be empty.', true);
        return;
    }

    const trimmedSuiteName = newSuiteName.trim();

    if (configs[matchedPattern] && configs[matchedPattern][trimmedSuiteName]) {
        showStatus(`Suite "${trimmedSuiteName}" already exists for this URL pattern.`, true);
        return;
    }

    // Add the new suite to the existing configuration for the matched pattern
    if (!configs[matchedPattern]) {
        configs[matchedPattern] = {};
    }
    configs[matchedPattern][trimmedSuiteName] = {}; // Initialize with an empty object

    await chrome.storage.local.set({ urlConfigs: configs });
    showStatus(`New suite "${trimmedSuiteName}" created successfully!`);
    suiteName = trimmedSuiteName; // Automatically switch to the new suite
    localStorage.setItem('lastSuite', suiteName);
    await loadConfig(); // Reload to update the dropdown and display the new suite
}

async function applyContentScript() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['contentScript.js'] });
        showStatus('Placeholders replaced!');
    } catch (error) {
        console.error("Script injection failed:", error);
        showStatus('Could not apply script to this page.', true);
    }
}

async function saveChanges() {
    // Use the globally stored pattern as the 'original' key
    const oldPattern = matchedPattern;

    if (!oldPattern) {
        showStatus('No config loaded to save.', true);
        return;
    }

    // Get the new (potentially edited) pattern from the input field
    const newPattern = document.getElementById('matchedPatternInput').value.trim();

    if (!newPattern) {
        showStatus('URL pattern cannot be empty.', true);
        return;
    }

    // Validate the new pattern
    try {
        new RegExp(newPattern.replace(/\*/g, '.*'));
    } catch (e) {
        showStatus('The provided pattern is invalid.', true);
        return;
    }

    // Collect all the key/value replacement pairs from the UI for the current suite
    const currentSuiteReplacements = {};
    document.querySelectorAll('.replacement-row').forEach(row => {
        const keyInput = row.querySelector('.key');
        const valueInput = row.querySelector('.value');
        if (keyInput && valueInput) {
            const key = keyInput.value.trim();
            if (key) {
                currentSuiteReplacements[key] = valueInput.value.trim();
            }
        }
    });

    const { urlConfigs } = await chrome.storage.local.get('urlConfigs');
    const configs = urlConfigs || {};

    // If the pattern was changed, update the key in the storage object.
    if (newPattern !== oldPattern) {
        // Check if the new pattern name would overwrite a different existing config.
        if (configs.hasOwnProperty(newPattern)) {
            showStatus('A configuration with this new pattern already exists.', true);
            return;
        }
        // Move the old configuration entry to the new pattern
        configs[newPattern] = configs[oldPattern];
        delete configs[oldPattern];
        matchedPattern = newPattern; // Update matchedPattern to the new one
    }

    // Ensure the current suite exists under the (potentially new) pattern
    if (!configs[matchedPattern]) {
        configs[matchedPattern] = {};
    }
    // Update the specific suite with the new replacements
    configs[matchedPattern][suiteName] = currentSuiteReplacements;

    await chrome.storage.local.set({ urlConfigs: configs });

    showStatus('Configuration saved successfully!');
    // Reload the entire UI from storage to ensure consistency.
    await loadConfig();
}


async function exportConfig() {
    const { urlConfigs } = await chrome.storage.local.get('urlConfigs');
    if (!urlConfigs || Object.keys(urlConfigs).length === 0) {
        showStatus('Nothing to export.', true);
        return;
    }
    const blob = new Blob([JSON.stringify(urlConfigs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'configs.json';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Config exported!');
}

function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const importedConfigs = JSON.parse(e.target.result);
            if (typeof importedConfigs !== 'object' || importedConfigs === null) {
                throw new Error('Invalid format');
            }
            await chrome.storage.local.set({ urlConfigs: importedConfigs });
            showStatus('Config imported successfully!');
            loadConfig();
        } catch {
            showStatus('Invalid or corrupt config file.', true);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}