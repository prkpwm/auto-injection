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

