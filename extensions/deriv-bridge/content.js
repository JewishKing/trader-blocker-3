console.log('[FocusGuard Bridge] Content script fully injected into frame:', window.location.href);

let currentLivePrice = null;
let currentLiveAsset = "Unknown Asset";

// Intelligent aggressive DOM scanner for TradingView & ChartIQ structure
function extractChartData() {
    let result = { asset: "Unknown Asset", price: null };

    // 1. Asset Name Extraction
    const assetSelectors = [
        'button[aria-label="Change symbol"]', // Verified charts.deriv.com selector
        '.js-symbol-title', '.pane-legend-title__title', '.cq-symbol', '.ciq-symbol',
        '.sc-title', '.symbol-name', 'div[data-name="legend-source-title"]'
    ];
    for (let sel of assetSelectors) {
        let el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 0) {
            result.asset = el.innerText.trim();
            break;
        }
    }

    // Deep fallback for Deriv Synthetic Indices
    if (result.asset === "Unknown Asset") {
        const allTextElems = Array.from(document.querySelectorAll('div, span'));
        for (let d of allTextElems) {
            const txt = d.innerText || "";
            if (txt && txt.length < 50 && (txt.includes('Volatility') || txt.includes('Step Index') || txt.includes('Crash') || txt.includes('Boom') || txt.includes('Jump') || txt.includes('Index'))) {
                result.asset = txt.replace(/\n.*/g, '').trim();
                break;
            }
        }
    }

    // 2. Price Extraction
    // Known element from charts.deriv.com containing "O ... H ... L ... C 32,644.75"
    const toolbarDiv = document.querySelector('div[role="toolbar"] div:last-child');
    if (toolbarDiv && toolbarDiv.innerText) {
        const cMatch = toolbarDiv.innerText.match(/C\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/);
        if (cMatch && cMatch[1]) {
            const val = parseFloat(cMatch[1].replace(/,/g, ''));
            if (!isNaN(val) && val > 0) {
                result.price = val;
                return result;
            }
        }
    }

    const priceSelectors = [
        '.js-symbol-last', '.symbol-last', '.price-axis-value',
        '.cq-current-price', '.ciq-current-price', '.stx-current-price', '.sc-current-price',
        '.tv-symbol-price', '.last-price', '.cq-coin-price'
    ];
    for (let sel of priceSelectors) {
        let el = document.querySelector(sel);
        if (el && el.innerText) {
            const pText = el.innerText.replace(/,/g, '').match(/[\d\.]+/);
            if (pText && pText[0]) {
                const val = parseFloat(pText[0]);
                if (!isNaN(val) && val > 0) {
                    result.price = val;
                    return result;
                }
            }
        }
    }

    // 3. Last Resort Regex
    const bodyText = document.body.innerText || "";
    const cMatch = bodyText.match(/C\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/);
    if (cMatch && cMatch[1]) {
        const p = parseFloat(cMatch[1].replace(/,/g, ''));
        if (!isNaN(p) && p > 0) {
            result.price = p;
            return result;
        }
    }

    return result;
}

// Fire the webhook to FocusGuard
async function fireFocusGuardAlert(targetPrice, livePrice, assetName) {
    try {
        const res = await fetch('http://localhost:51700/alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ticker: assetName.substring(0, 10),
                message: `Alert: ${assetName} hit ${targetPrice}`
            })
        });
        console.log('[FocusGuard] Alert successfully fired to localhost:51700!', await res.json());
    } catch (err) {
        console.error('[FocusGuard] Failed to hit local webhook. Is the desktop app running?', err);
    }
}

// Background Monitor Loop - Independent per frame
setInterval(() => {
    const data = extractChartData();

    if (data.price !== null) {
        currentLivePrice = data.price;
        currentLiveAsset = data.asset;

        // We found a valid chart in this specific frame!
        // Broadcast it to the background/popup so they know this frame is the active one.
        try {
            chrome.runtime.sendMessage({
                action: 'live_data_update',
                price: data.price,
                asset: data.asset
            });
        } catch (err) {
            // Ignore: popup might just be closed.
        }

        // Now check if there is an active alert set in local storage
        chrome.storage.local.get(['derivAlertTarget', 'derivAlertCondition', 'derivAlertAsset'], (res) => {
            const target = res.derivAlertTarget;
            const cond = res.derivAlertCondition;
            const savedAsset = res.derivAlertAsset;

            if (!target || !cond) return; // No active alert

            // Safety check: only trigger the alert if the currently visible asset matches the saved asset!
            if (savedAsset && currentLiveAsset !== savedAsset) {
                // Wrong tab, do not trigger
                return;
            }

            let isHit = false;
            if (cond === 'above' && currentLivePrice >= target) {
                isHit = true;
            } else if (cond === 'below' && currentLivePrice <= target) {
                isHit = true;
            }

            if (isHit) {
                console.log(`[FocusGuard] TARGET HIT! Current: ${currentLivePrice}, Target: ${target} (${cond})`);

                // 1. Fire Webhook
                fireFocusGuardAlert(target, currentLivePrice, currentLiveAsset);

                // 2. Clear the alert so it doesn't spam loop
                chrome.storage.local.remove(['derivAlertTarget', 'derivAlertCondition', 'derivAlertAsset']);

                // 3. Show Browser Notification
                alert(`🚨 FocusGuard Alert!\n${currentLiveAsset} crossed your target of ${target}.\nUnlocking your platforms now!`);
            }
        });

    }
}, 500); // Check every 500ms
