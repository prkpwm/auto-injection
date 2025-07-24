chrome.storage.local.get('urlConfigs', ({ urlConfigs }) => {
    const config = urlConfigs || {};
    const currentUrl = window.location.href;
    let replacements = {};

    for (const [pattern, values] of Object.entries(config)) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        if (regex.test(currentUrl)) {
            replacements = values || {};
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
               
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                if (regex.test(url)) {
                    return replacements;
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

