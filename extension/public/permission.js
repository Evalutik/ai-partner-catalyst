const statusEl = document.getElementById('status');
const grantBtn = document.getElementById('grantBtn');

// Store the opener tab ID to return to it
let openerTabId = null;

// Get the tab that opened this permission page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
        chrome.tabs.query({}, (allTabs) => {
            const currentIndex = allTabs.findIndex(t => t.id === tabs[0].id);
            if (currentIndex > 0) {
                openerTabId = allTabs[currentIndex - 1].id;
            }
        });
    }
});

function handleSuccess() {
    statusEl.textContent = 'Success! Closing...';
    statusEl.className = 'status-requesting'; // Keep it light
    grantBtn.textContent = 'Granted';
    grantBtn.disabled = true;

    // Close and return
    setTimeout(() => {
        if (openerTabId) {
            chrome.tabs.update(openerTabId, { active: true }, () => {
                window.close();
            });
        } else {
            window.close();
        }
    }, 1000);
}

async function requestPermission() {
    try {
        statusEl.textContent = 'Requesting...';
        statusEl.className = 'status-requesting';
        grantBtn.disabled = true;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Stop stream immediately
        stream.getTracks().forEach(track => track.stop());

        handleSuccess();

    } catch (err) {
        console.log("Permission request failed or dismissed", err);
        // If it fails immediately, it might be blocked.
        // We reset the button so they can try click explicitly (which might trigger the 'blocked' bubble bubble if hidden)
        statusEl.textContent = '';
        statusEl.className = '';
        grantBtn.disabled = false;
        grantBtn.textContent = 'Allow Access';
    }
}

// Check permission state efficiently
async function checkAndRequest() {
    try {
        const result = await navigator.permissions.query({ name: 'microphone' });

        if (result.state === 'granted') {
            handleSuccess();
            return;
        }

        if (result.state === 'denied') {
            // If denied, don't auto-request as it will fail instantly.
            // Just let the user click 'Allow Access' which will show the "blocked" bubble in address bar
            console.log("Permission is denied, waiting for user action");
            statusEl.textContent = 'Permission blocked. Click icon in address bar.';
            statusEl.style.color = '#c45050';
            grantBtn.textContent = 'Try Again';
            return; // Don't auto-request
        }

        // If prompt, go ahead and request
        if (result.state === 'prompt') {
            requestPermission();
        }

    } catch (e) {
        // Fallback if permissions query fails
        requestPermission();
    }
}

grantBtn.addEventListener('click', requestPermission);

// Auto-request on load
window.addEventListener('load', () => {
    setTimeout(checkAndRequest, 800);
});

// Poll check for permission (if user changes it in settings UI)
setInterval(async () => {
    const result = await navigator.permissions.query({ name: 'microphone' });
    if (result.state === 'granted') {
        // Only trigger success if we aren't already closing
        if (!grantBtn.disabled || grantBtn.textContent !== 'Granted') {
            handleSuccess();
        }
    }
}, 2000); // Check every 2s - efficient enough
