# ai-partner-catalyst

This file will be used for final documentation. See `ARCHITECTURE.md` for development details.

---

## Developer Setup

### Prerequisites

- Node.js 18+
- npm
- Chrome browser

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/ai-partner-catalyst.git
cd ai-partner-catalyst

# 2. Install extension dependencies
cd extension
npm install

# 3. Build the extension
npm run build

# 4. Load in Chrome
# - Open chrome://extensions
# - Enable "Developer mode" (top right)
# - Click "Load unpacked"
# - Select the extension/dist folder
```

### Development

```bash
# Watch mode (auto-rebuild on changes)
cd extension
npm run dev
```

After making changes, click the refresh icon on the extension card in `chrome://extensions`.

### Hotkey

Press **Alt+V** to open the Aeyes popup.

---

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full technical documentation.
