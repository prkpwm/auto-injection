File: background.js
Content:
// Add this to your background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'CONFIG_LOADED':
            console.log('Text replacement config loaded with',
                message.data.replacementsCount, 'replacements');
            break;
        case 'DEBUG':
            console.log('DEBUG:', message.data.text);
            break;

        case 'TEXT_REPLACED':
            console.log('Text replaced:', {
                placeholder: message.data.placeholder,
                originalText: message.data.originalText,
                newText: message.data.newText,
                url: message.data.url,
                tabId: sender.tab.id
            });
            break;
    }
});

// Optional: Keep track of replacements across tabs
const replacementLogs = {};

chrome.runtime.onMessage.addListener((message, sender) => {
    if (!sender.tab) return;

    const tabId = sender.tab.id;

    if (!replacementLogs[tabId]) {
        replacementLogs[tabId] = {
            replacements: [],
            startTime: new Date()
        };
    }

    if (message.type === 'TEXT_REPLACED') {
        replacementLogs[tabId].replacements.push(message.data);
    }
});

// Optional: Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (replacementLogs[tabId]) {
        console.log(`Tab ${tabId} had ${replacementLogs[tabId].replacements.length} replacements`);
        delete replacementLogs[tabId];
    }
});

fetch(chrome.runtime.getURL('config.json'))
    .then(response => response.json())
    .then(jsonConfig => {
        chrome.storage.local.get('urlConfigs', ({ urlConfigs }) => {
            const config = urlConfigs || {};
            if (!Object.keys(config).length) {
                chrome.storage.local.set({ urlConfigs: jsonConfig });
            }
        });
    })
    .catch(error => {
        console.error("Error loading config.json:", error);
    });


------------------------------------------------------------
File: config.json
Content:
{
  "http://localhost:4300/liveness-monitoring": {
    "suite1": {
      "ระบุบัญชีผู้ใช้งาน": "OMRLAN01"
    },
    "suite2": {
      "ระบุบัญชีผู้ใช้งาน": "OMRLAN02"
    }
  },
  "http://localhost:4300/selling-device/*": {
    "suite1": {
      "ระบุบัญชีผู้ใช้งาน": "OMRLAN02",
      "PHONE": "0912345678",
      "USERNAME": "OMRLAN2",
      "กรุณากรอกหมายเลขบัตรเครดิต": "1234",
      "ค้นหาด้วยรหัสสินค้าหรือหมายเลขสินค้า": "202112030010033",
      "ระบุเบอร์โทรศัพท์": "66955661611"
    }
  }
}

------------------------------------------------------------
File: contentScript.js
Content:
chrome.storage.local.get('urlConfigs', ({ urlConfigs }) => {
    const config = urlConfigs || {};
    const currentUrl = window.location.href;
    let replacements = {};
    const sortedEntries = Object.entries(config).sort((a, b) => a[0].length - b[0].length);

    chrome.runtime.sendMessage({
        type: 'DEBUG',
        data: {
            text: sortedEntries
        }
    });

    for (const [pattern, values] of sortedEntries) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const regex2 = new RegExp('^' + pattern.slice(0, -2) + '$')
        if (regex.test(currentUrl) || regex2.test(currentUrl)) {
            replacements = values.suite1 || {};
            break;
        }
    }

    if (!replacements || typeof replacements !== 'object') return;

    const processedElements = new WeakSet();

    function simulateInput(element, value) {
        element.focus();
        element.value = '';
        for (let i = 0; i < value.length; i++) {
            element.value += value[i];
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function replaceText(element) {
        if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && !processedElements.has(element)) {
            for (const [placeholder, value] of Object.entries(replacements)) {
                const attributesToCheck = ['name', 'id', 'placeholder', 'type'];
                if (attributesToCheck.some(attr => {
                    const attrValue = element[attr];
                    return attrValue && attrValue.toLowerCase().includes(placeholder.toLowerCase());
                })) {
                    const originalText = element.value;
                    setTimeout(() => {
                        simulateInput(element, value);
                        chrome.runtime.sendMessage({
                            type: 'TEXT_REPLACED',
                            data: {
                                placeholder,
                                originalText,
                                newText: element.value,
                                url: window.location.href,
                                elementType: element.tagName
                            }
                        });
                    }, 0);
                    processedElements.add(element);
                    break;
                }
            }
        } else if (element.hasChildNodes()) {
            element.childNodes.forEach(replaceText);
        }
    }

    replaceText(document.body);
    new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(replaceText));
    }).observe(document.body, { childList: true, subtree: true });



    function findMatchingConfig(url, configs) {
        for (const [pattern, replacements] of Object.entries(configs)) {
            try {

                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                const regex2 = new RegExp('^' + pattern.slice(0, -2) + '$')
                if (regex.test(url) || regex2.test(url)) {
                    return replacements.suite1;
                }
            } catch (e) {
                console.error(`AutoKey: Invalid pattern in config: ${pattern}`);
            }
        }
        return null;
    }

    function replaceTextInNode(node, replacements) {
        if (node.nodeType === Node.TEXT_NODE) {
            let text = node.textContent;
            for (const [placeholder, value] of Object.entries(replacements)) {

                const regex = new RegExp(placeholder, 'g');
                text = text.replace(regex, value);
            }
            node.textContent = text;
        } else {

            for (const child of node.childNodes) {
                replaceTextInNode(child, replacements);
            }
        }
    }


    async function main() {
        const { urlConfigs } = await chrome.storage.local.get('urlConfigs');
        if (!urlConfigs || Object.keys(urlConfigs).length === 0) {
            console.log('AutoKey: No configurations found.');
            return;
        }

        const replacements = findMatchingConfig(window.location.href, urlConfigs);

        if (replacements && Object.keys(replacements).length > 0) {
            console.log(`AutoKey: Found config for ${window.location.href}. Applying replacements.`);
            replaceTextInNode(document.body, replacements);
        }
    }

    main();
});


------------------------------------------------------------
File: manifest.json
Content:
{
  "manifest_version": 3,
  "name": "Auto Injection",
  "version": "1.0",
  "description": "Autofill on webpages with values from a config file",
  "permissions": ["storage", "scripting", "tabs", "activeTab"],
  "host_permissions": ["http://*/", "https://*/"],
  "author": "PRKPWM",
  "icons": {
    "16": "injection.png",
    "48": "injection.png",
    "128": "injection.png"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": "injection.png"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["contentScript.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["config.json"],
      "matches": ["<all_urls>"]
    }
  ]
}

------------------------------------------------------------
File: popup.html
Content:
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Auto Injection Settings</title>
    <link rel="stylesheet" href="popup.css">
</head>
<body>

    <div class="container">
        <header class="header">
            <h3>Auto Injection</h3>
            <button id="replaceBtn" class="primary-btn">Inject</button>
        </header>

        <div id="config-info" class="config-info-container"></div>

        <div id="new-config-area" style="display: none; padding: 10px; border: 1px dashed #ccc; margin-top: 10px;">
            <p style="margin-top: 0;">No config found. Create one for this site?</p>
            <input type="text" id="newUrlPatternInput" placeholder="Enter URL pattern, e.g., https://*.google.com/*" style="width: 95%; margin-bottom: 8px;">
            <button id="createConfigBtn" class="primary-btn" style="width: 100%;">Create New Configuration</button>
        </div>

        <div class="table-container">
            <div id="replacementList">
                </div>
        </div>
        
        <div class="actions">
             <button id="saveBtn">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M7 19V13H17V19H7ZM5 21C4.45 21 3.979 20.804 3.587 20.412C3.195 20.02 3 19.55 3 19V5C3 4.45 3.196 3.979 3.588 3.587C3.98 3.195 4.45 3 5 3H16.175L19 5.825V19C19 19.55 18.804 20.021 18.412 20.413C18.02 20.805 17.55 21 17 21H5Z"/></svg>
                 Save
             </button>
             <button id="exportBtn">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M5 20V4H11V6H7V18H17V13H19V20H5ZM13 14L11.6 12.6L14.175 10H4V8H14.175L11.6 5.4L13 4L18 9L13 14Z"/></svg>
                 Export
             </button>
             <input type="file" id="importFile" accept=".json" style="display:none" />
             <button id="importBtn">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M11 16V7.825L8.4 10.4L7 9L12 4L17 9L15.6 10.4L13 7.825V16H11ZM5 20C4.45 20 3.979 19.804 3.587 19.412C3.195 19.02 3 18.55 3 18V15H5V18H19V15H21V18C21 18.55 20.804 19.021 20.412 19.413C20.02 19.805 19.55 20 19 20H5Z"/></svg>
                 Import
             </button>
        </div>

        <div id="status" class="status-message"></div>
    </div>

    <script src="popup.js"></script>
</body>
</html>
------------------------------------------------------------
File: popup.js
Content:
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

// Dynamic dropdown suite switch
document.addEventListener('change', (event) => {
    if (event.target.id === 'myDropdown') {
        suiteName = event.target.value;
        localStorage.setItem('lastSuite', suiteName);
        replacements = configSets[suiteName] || {};
        loadConfig()
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

    for (const [pattern, configSet] of Object.entries(configs)) {
        try {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            const regex2 = new RegExp('^' + pattern.slice(0, -2) + '$');
            if (regex.test(url) || regex2.test(url)) {
                layer2Keys = Object.keys(configSet);
                replacements = configSet[suiteName] || configSet[layer2Keys[0]];
                matchedPattern = pattern;
                break;
            }
        } catch (e) {
            console.error(`Invalid regex pattern in config: ${pattern}`);
        }
    }
    

    // if (!configSets[suiteName] && !configSet[layer2Keys[0]]) {
    //     showStatus(`Suite not found. Defaulting to empty config.`, true);
    // }

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

    // Collect all the key/value replacement pairs from the UI
    const newReplacements = {};
    document.querySelectorAll('.replacement-row').forEach(row => {
        const keyInput = row.querySelector('.key');
        const valueInput = row.querySelector('.value');
        if (keyInput && valueInput) {
            const key = keyInput.value.trim();
            if (key) {
                if(!newReplacements.hasOwnProperty(suiteName)) {
                    newReplacements[suiteName] = {}
                }
                newReplacements[suiteName][key] = valueInput.value.trim();
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
        // Remove the old configuration entry.
        delete configs[oldPattern];
    }

    // Save the replacements under the new (or existing) pattern key.
    configs[newPattern] = {...configs[oldPattern],...newReplacements};
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
------------------------------------------------------------
