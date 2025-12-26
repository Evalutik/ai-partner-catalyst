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

async function requestPermission() {
    try {
        statusEl.textContent = 'Requesting...';
        grantBtn.disabled = true;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Stop stream immediately
        stream.getTracks().forEach(track => track.stop());

        statusEl.textContent = 'Success! Closing...';
        grantBtn.textContent = 'Granted';

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

    } catch (err) {
        console.error(err);
        statusEl.textContent = ''; // Clear status, let user click button
        grantBtn.disabled = false;
        grantBtn.textContent = 'Allow Access';
    }
}

grantBtn.addEventListener('click', requestPermission);

// Auto-request on load
window.addEventListener('load', () => {
    setTimeout(requestPermission, 800);
});
