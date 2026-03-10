document.addEventListener('DOMContentLoaded', () => {
    const views = {
        setup: document.getElementById('setup-view'),
        active: document.getElementById('active-view')
    };

    const els = {
        liveAsset: document.getElementById('live-asset'),
        livePrice: document.getElementById('live-price'),
        targetPrice: document.getElementById('target-price'),
        condition: document.getElementById('condition'),
        btnSet: document.getElementById('btn-set'),
        btnCancel: document.getElementById('btn-cancel'),
        activeAssetName: document.getElementById('active-asset-name'),
        activeCondition: document.getElementById('active-condition'),
        activeTarget: document.getElementById('active-target'),
        assetWarning: document.getElementById('asset-warning'),
        statusMsg: document.getElementById('status-msg')
    };

    let currentLiveAsset = "";
    let lastReceivedBroadcastTime = 0;

    function updateUI() {
        chrome.storage.local.get(['derivAlertTarget', 'derivAlertCondition', 'derivAlertAsset'], (res) => {
            if (res.derivAlertTarget) {
                views.setup.style.display = 'none';
                views.active.style.display = 'block';
                els.activeTarget.textContent = res.derivAlertTarget;
                els.activeAssetName.textContent = res.derivAlertAsset || "Unknown Asset";
                els.activeCondition.textContent = res.derivAlertCondition === 'above' ? '≥' : '≤';

                // Show warning if the user switched tabs to a different asset
                if (currentLiveAsset && res.derivAlertAsset && currentLiveAsset !== res.derivAlertAsset && currentLiveAsset !== "No Chart Detected") {
                    els.assetWarning.style.display = 'block';
                } else {
                    els.assetWarning.style.display = 'none';
                }
            } else {
                views.setup.style.display = 'block';
                views.active.style.display = 'none';
            }
        });
    }

    updateUI();

    // Listen for passive broadcasts from content.js (from ANY iframe)
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'live_data_update') {
            lastReceivedBroadcastTime = Date.now();
            currentLiveAsset = request.asset;

            els.liveAsset.textContent = request.asset;
            els.livePrice.textContent = request.price;
            els.statusMsg.textContent = ''; // clear any errors

            // Pre-fill target input if empty and setup view is showing
            if (!els.targetPrice.value && document.activeElement !== els.targetPrice) {
                els.targetPrice.value = request.price;
            }
            updateUI();
        }
    });

    // Verify tab status in case content.js isn't broadcasting yet
    setInterval(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) return;

            const tabUrl = tabs[0].url || '';
            if (!tabUrl.includes('deriv.com') && !tabUrl.includes('deriv.app') && !tabUrl.includes('deriv.net')) {
                els.liveAsset.textContent = 'Extension Off';
                els.livePrice.textContent = '---.---';
                els.statusMsg.textContent = 'Please switch to your Deriv chart tab.';
                currentLiveAsset = "No Chart Detected";
                return;
            }

            // If we haven't received a broadcast in the last 2 seconds...
            if (Date.now() - lastReceivedBroadcastTime > 2000) {
                els.liveAsset.textContent = 'No Chart Detected';
                els.livePrice.textContent = '---.---';
                els.statusMsg.textContent = 'No live price. Please REFRESH this page.';
                currentLiveAsset = "No Chart Detected";
            }
        });
    }, 1000);

    // Set Alert
    els.btnSet.addEventListener('click', () => {
        const target = parseFloat(els.targetPrice.value);
        const cond = els.condition.value;
        if (isNaN(target)) {
            els.statusMsg.textContent = 'Invalid target price!';
            return;
        }

        const asset = els.liveAsset.textContent;
        if (asset === 'No Chart Detected' || asset === 'Extension Off') {
            els.statusMsg.textContent = 'Cannot set alert: No asset detected.';
            return;
        }

        chrome.storage.local.set({
            derivAlertTarget: target,
            derivAlertCondition: cond,
            derivAlertAsset: asset
        }, () => {
            updateUI();
            els.statusMsg.textContent = 'Alert successfully set!';
            setTimeout(() => els.statusMsg.textContent = '', 2000);
        });
    });

    // Cancel Alert
    els.btnCancel.addEventListener('click', () => {
        chrome.storage.local.remove(['derivAlertTarget', 'derivAlertCondition', 'derivAlertAsset'], () => {
            updateUI();
            els.statusMsg.textContent = 'Alert cancelled.';
            setTimeout(() => els.statusMsg.textContent = '', 2000);
        });
    });
});
