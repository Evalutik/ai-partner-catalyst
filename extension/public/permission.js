// Permission page script - requests microphone access
const statusEl = document.getElementById('status');
const grantBtn = document.getElementById('grantBtn');

// Store the opener tab ID to return to it
let openerTabId = null;

// Get the tab that opened this permission page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
        // Store current tab, we'll focus the previous one
        chrome.tabs.query({}, (allTabs) => {
            const currentIndex = allTabs.findIndex(t => t.id === tabs[0].id);
            if (currentIndex > 0) {
                openerTabId = allTabs[currentIndex - 1].id;
            }
        });
    }
});

grantBtn.addEventListener('click', async () => {
    try {
        statusEl.textContent = 'Requesting permission...';
        statusEl.className = '';
        grantBtn.disabled = true;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Stop the stream immediately - we just needed the permission
        stream.getTracks().forEach(track => track.stop());

        statusEl.textContent = '✓ Permission granted! Returning to your page...';
        statusEl.className = 'success';
        grantBtn.textContent = 'Done!';

        // Focus the original tab and close this one
        setTimeout(() => {
            if (openerTabId) {
                chrome.tabs.update(openerTabId, { active: true }, () => {
                    window.close();
                });
            } else {
                window.close();
            }
        }, 1500);

    } catch (err) {
        statusEl.textContent = '✗ Permission denied. Please click Allow and select "Always allow".';
        statusEl.className = 'error';
        grantBtn.disabled = false;
        grantBtn.textContent = 'Try Again';
    }
});
