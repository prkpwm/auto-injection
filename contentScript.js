chrome.storage.local.get('urlConfigs', ({ urlConfigs }) => {

    const config = urlConfigs || {};
    const currentUrl = window.location.href;
    let replacements = {};
    const sortedEntries = Object.entries(config).sort((a, b) => a[0].length - b[0].length);
    let suiteName = "suite1"

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
            replacements = values[suiteName] || {};
            break;
        }
    }

    if (!replacements || typeof replacements !== 'object') return;

    const processedElements = new WeakSet();
    const replaceQueue = [];
    const DELAY_MS = 16;

    async function simulateInput(element, value) {
        element.focus();
        element.value = '';
        for (let i = 0; i < value.length; i++) {
            element.value += value[i];
            element.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function executeReplaceQueue() {
        for (const operation of replaceQueue) {
            await simulateInput(operation.element, operation.value);
            chrome.runtime.sendMessage({
                type: 'TEXT_REPLACED',
                data: {
                    placeholder: operation.placeholder,
                    originalText: operation.originalText,
                    newText: operation.element.value,
                    url: window.location.href,
                    elementType: operation.element.tagName
                }
            });
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
    }

    function replaceText(element) {
        replacements ||={} 
        if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && !processedElements.has(element)) {
            chrome.runtime.sendMessage({
                type: 'DEBUG',
                data: {
                    text: `replaceText ${JSON.stringify(replacements)} `
                }
            });

            for (const [placeholder, value] of Object.entries(replacements)) {
                const attributesToCheck = [
                    'name',
                    'id',
                    'placeholder',
                    'type',
                    'aria-label',
                    'title',
                    'data-label',
                    'data-name',
                    'alt',
                    'autocomplete',
                    'class',
                    'role'
                ];

                if (attributesToCheck.some(attr => {
                    const attrValue = element[attr];
                    return attrValue && attrValue.toLowerCase().includes(placeholder.toLowerCase());
                })) {
                    replaceQueue.push({
                        element,
                        value,
                        placeholder,
                        originalText: element.value
                    });
                    processedElements.add(element);
                    break;
                }
            }
        } else if (element.hasChildNodes()) {
            element.childNodes.forEach(replaceText);
        }
    }

    new MutationObserver(mutations => {
        setTimeout(() => {
            mutations.forEach(m => m.addedNodes.forEach(replaceText));
            executeReplaceQueue();
        }, DELAY_MS);
    }).observe(document.body, { childList: true, subtree: true });



    function findMatchingConfig(url, configs, suiteName) {
        for (const [pattern, replacements] of Object.entries(configs)) {
            try {

                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                const regex2 = new RegExp('^' + pattern.slice(0, -2) + '$')


                if (regex.test(url) || regex2.test(url)) {

                    chrome.runtime.sendMessage({
                        type: 'DEBUG',
                        data: {
                            text: replacements[suiteName]
                        }
                    });
                    return replacements[suiteName];
                }
            } catch (e) {
                console.error(`AutoKey: Invalid pattern in config: ${pattern}`);
            }
        }
        return null;
    }


    async function main() {
        const { urlConfigs } = await chrome.storage.local.get('urlConfigs');
        const { activeSuiteName } = await chrome.storage.local.get('activeSuiteName');
        suiteName = activeSuiteName

        chrome.runtime.sendMessage({
            type: 'DEBUG',
            data: {
                text: suiteName
            }
        });
        if (!urlConfigs || Object.keys(urlConfigs).length === 0) {
            console.log('AutoKey: No configurations found.');
            return;
        }

        replacements = findMatchingConfig(window.location.href, urlConfigs, activeSuiteName);

        if (replacements && Object.keys(replacements).length > 0) {
            console.log(`AutoKey: Found config for ${window.location.href}. Applying replacements.`);
            replaceText(document.body);
            executeReplaceQueue();
        }
    }

    main();
});

