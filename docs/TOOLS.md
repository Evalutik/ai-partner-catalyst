# AI Agent Tools Reference

This document provides a complete reference of all tools available to the AI agent, how they work, and what they call on the frontend.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Backend (Python/FastAPI)                                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Gemini AI (prompts.py)                                   │  │
│  │ - Receives user request + page context                   │  │
│  │ - Returns JSON: { response, actions[], requiresFollowUp }│  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  Endpoint: POST /conversation                                   │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ Frontend - Sidepanel (TypeScript/React)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Action Executor (lib/actionExecutor.ts)                  │  │
│  │ - Receives actions array from backend                    │  │
│  │ - Routes to appropriate handler                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Handlers (lib/handlers/)                                 │  │
│  │ - browserHandler: Tab operations                         │  │
│  │ - navigationHandler: URL navigation, back, reload        │  │
│  │ - domHandler: DOM extraction                             │  │
│  │ - communicationHandler: Speech (say, ask)                │  │
│  │ - systemHandler: wait, scan_page, notify_plan            │  │
│  │ - interactionHandler: click, type, scroll, etc.          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  Chrome Extension API (for tabs/navigation)                     │
│  OR ↓                                                            │
│  Message to Content Script                                      │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ Content Script (TypeScript)                                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Action Executor (content/tools/actionExecutor.ts)        │  │
│  │ - Receives EXECUTE_ACTION message                        │  │
│  │ - Calls appropriate action function                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Action Functions (content/tools/actions/)                │  │
│  │ - interactionActions.ts: click, type, scroll, focus      │  │
│  │ - navigationActions.ts: navigate                         │  │
│  │ - searchActions.ts: search, read                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                  │
│  Direct DOM Manipulation (on the web page)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tool Categories

### 1. Perception Tools
Tools that help the AI understand the current page state.

### 2. Navigation Tools
Tools that change the current page or tab.

### 3. Interaction Tools
Tools that interact with elements on the page.

### 4. Tab Management Tools
Tools that manage browser tabs.

### 5. Communication Tools
Tools that communicate with the user.

### 6. System Tools
Utility tools for timing and planning.

---

## Complete Tool Reference

### Perception Tools

#### `scan_page`
**Purpose:** Get a high-level overview of page structure.

**AI Usage:**
```json
{ "type": "scan_page", "args": { "max_depth": 2 } }
```

**Frontend Flow:**
1. Sidepanel: `systemHandler` (does nothing, just waits 500ms)
2. Note: Actual scanning happens during perception phase via `extractDOM`

**Returns:** Page structure with headers, landmarks, interaction point count

**Implementation:**
- Content: `content/tools/analysis/dom.ts` → `scanPage()`
- Called automatically during perception, not as an action

---

#### `fetch_dom`
**Purpose:** Extract interactive elements from the page for AI analysis.

**AI Usage:**
```json
{ "type": "fetch_dom", "args": { "selector": "body", "limit": 50, "optimize": true } }
```

**Frontend Flow:**
1. Sidepanel: `domHandler.execute()`
2. Calls: `lib/analysis.ts` → `extractDOM()`
3. Sends: Chrome message `EXTRACT_DOM` to content script
4. Content: `content/tools/analysis/dom.ts` → `extractDOM()`

**Returns:** Array of elements with IDs, tags, text, roles, etc.

**Implementation:**
- Sidepanel: `lib/handlers/domHandlers.ts`
- Content: `content/tools/analysis/dom.ts` → `extractDOM()`

---

#### `get_page_status`
**Purpose:** Get basic page info (URL, title, scroll position).

**AI Usage:**
```json
{ "type": "get_page_status" }
```

**Frontend Flow:**
1. Sidepanel: `domHandler.execute()`
2. Sends: Chrome message `GET_PAGE_STATUS` to content script
3. Content: `content/tools/analysis/pageStatus.ts` → `getPageStatus()`

**Returns:** `{ url, title, scrollX, scrollY, windowWidth, windowHeight, loading }`

**Implementation:**
- Sidepanel: `lib/handlers/domHandlers.ts`
- Content: `content/tools/analysis/pageStatus.ts`

---

### Navigation Tools

#### `navigate`
**Purpose:** Navigate to a URL.

**AI Usage:**
```json
{ "type": "navigate", "args": { "url": "https://example.com", "newTab": false, "waitForPage": true } }
```

**Frontend Flow:**
1. Sidepanel: `navigationHandler.execute()`
2. Calls: `lib/actions/navigationActions.ts` → `navigate()`
3. Uses: `chrome.tabs.update()` or `chrome.tabs.create()`
4. Waits for page load if `waitForPage: true`

**Alternative (from content script):**
- Content: `content/tools/actions/navigationActions.ts` → `actionNavigate()`
- Sets: `window.location.href = url`

**Implementation:**
- Sidepanel: `lib/handlers/navigationHandlers.ts`
- Sidepanel Action: `lib/actions/navigationActions.ts`
- Content: `content/tools/actions/navigationActions.ts`

---

#### `go_back`
**Purpose:** Navigate back in browser history.

**AI Usage:**
```json
{ "type": "go_back" }
```

**Frontend Flow:**
1. Sidepanel: `navigationHandler.execute()`
2. Calls: `lib/actions/navigationActions.ts` → `goBack()`
3. Uses: `chrome.tabs.goBack()`

**Implementation:**
- Sidepanel: `lib/handlers/navigationHandlers.ts`
- Sidepanel Action: `lib/actions/navigationActions.ts`

---

#### `reload`
**Purpose:** Reload the current page.

**AI Usage:**
```json
{ "type": "reload" }
```

**Frontend Flow:**
1. Sidepanel: `navigationHandler.execute()`
2. Calls: `lib/actions/navigationActions.ts` → `reload()`
3. Uses: `chrome.tabs.reload()`

**Implementation:**
- Sidepanel: `lib/handlers/navigationHandlers.ts`
- Sidepanel Action: `lib/actions/navigationActions.ts`

---

### Interaction Tools

#### `click`
**Purpose:** Click an element on the page.

**AI Usage:**
```json
{ "type": "click", "args": { "elementId": "el-123", "description": "Submit button" } }
```

**Frontend Flow:**
1. Sidepanel: `interactionHandler.execute()`
2. If `description` provided: Calls `/resolve-element` endpoint to get `elementId`
3. Calls: `lib/actions/pageActions.ts` → `executePageAction()`
4. Sends: Chrome message `EXECUTE_ACTION` to content script
5. Content: `content/tools/actionExecutor.ts` → `executeAction()`
6. Content: `content/tools/actions/interactionActions.ts` → `actionClick()`
7. Scrolls element into view, highlights it, dispatches click events

**Implementation:**
- Sidepanel: `lib/handlers/interactionHandlers.ts`
- Content: `content/tools/actions/interactionActions.ts` → `actionClick()`

---

#### `type`
**Purpose:** Type text into an input field.

**AI Usage:**
```json
{ "type": "type", "args": { "elementId": "el-456", "value": "search query", "submit": true } }
```

**Frontend Flow:**
1. Sidepanel: `interactionHandler.execute()`
2. Resolves element if needed
3. Sends to content script
4. Content: `content/tools/actions/interactionActions.ts` → `actionType()`
5. Sets input value, dispatches input/change events

**Implementation:**
- Sidepanel: `lib/handlers/interactionHandlers.ts`
- Content: `content/tools/actions/interactionActions.ts` → `actionType()`

---

#### `scroll`
**Purpose:** Scroll the page.

**AI Usage:**
```json
{ "type": "scroll", "args": { "direction": "down" } }
```

**Options:** `"up"`, `"down"`, `"top"`, `"bottom"`, or omit for default down

**Frontend Flow:**
1. Sidepanel: `interactionHandler.execute()`
2. Sends to content script
3. Content: `content/tools/actions/interactionActions.ts` → `actionScroll()`
4. Uses `window.scrollBy()` or `window.scrollTo()`

**Implementation:**
- Sidepanel: `lib/handlers/interactionHandlers.ts`
- Content: `content/tools/actions/interactionActions.ts` → `actionScroll()`

---

#### `focus`
**Purpose:** Focus on an element and scroll it into view.

**AI Usage:**
```json
{ "type": "focus", "args": { "elementId": "el-789" } }
```

**Frontend Flow:**
1. Sidepanel: `interactionHandler.execute()`
2. Sends to content script
3. Content: `content/tools/actions/interactionActions.ts` → `actionFocus()`
4. Calls `element.focus()` and `scrollIntoView()`

**Implementation:**
- Sidepanel: `lib/handlers/interactionHandlers.ts`
- Content: `content/tools/actions/interactionActions.ts` → `actionFocus()`

---

#### `search`
**Purpose:** Perform a search on the current page (finds search input and submits).

**AI Usage:**
```json
{ "type": "search", "args": { "value": "search query" } }
```

**Frontend Flow:**
1. Sidepanel: `interactionHandler.execute()`
2. Sends to content script
3. Content: `content/tools/actions/searchActions.ts` → `actionSearch()`
4. Finds search input using selectors: `input[type="search"]`, `input[name="q"]`, etc.
5. Fills input and submits form or presses Enter

**Implementation:**
- Sidepanel: `lib/handlers/interactionHandlers.ts`
- Content: `content/tools/actions/searchActions.ts` → `actionSearch()`

---

#### `read`
**Purpose:** Read the text content of a specific element.

**AI Usage:**
```json
{ "type": "read", "args": { "elementId": "el-999" } }
```

**Frontend Flow:**
1. Sidepanel: `interactionHandler.execute()`
2. Sends to content script
3. Content: `content/tools/actions/searchActions.ts` → `actionRead()`
4. Extracts `innerText` or `textContent` (limited to 500 chars)

**Returns:** `{ success: true, message: "Read content", data: { text: "..." } }`

**Implementation:**
- Sidepanel: `lib/handlers/interactionHandlers.ts`
- Content: `content/tools/actions/searchActions.ts` → `actionRead()`

---

### Tab Management Tools

#### `open_tab`
**Purpose:** Open a new browser tab.

**AI Usage:**
```json
{ "type": "open_tab", "args": { "url": "https://example.com" } }
```

**Frontend Flow:**
1. Sidepanel: `browserHandler.execute()`
2. Calls: `lib/actions/tabActions.ts` → `handleTabAction()`
3. Uses: `chrome.tabs.create()`

**Implementation:**
- Sidepanel: `lib/handlers/browserHandlers.ts`
- Sidepanel Action: `lib/actions/tabActions.ts`

---

#### `close_tab`
**Purpose:** Close the current tab.

**AI Usage:**
```json
{ "type": "close_tab" }
```

**Frontend Flow:**
1. Sidepanel: `browserHandler.execute()`
2. Calls: `lib/actions/tabActions.ts` → `handleTabAction()`
3. Uses: `chrome.tabs.remove()`

**Implementation:**
- Sidepanel: `lib/handlers/browserHandlers.ts`
- Sidepanel Action: `lib/actions/tabActions.ts`

---

#### `switch_tab`
**Purpose:** Switch to a different tab.

**AI Usage:**
```json
{ "type": "switch_tab", "args": { "tabId": 123 } }
```

**Frontend Flow:**
1. Sidepanel: `browserHandler.execute()`
2. Calls: `lib/actions/tabActions.ts` → `handleTabAction()`
3. Uses: `chrome.tabs.update({ active: true })`

**Implementation:**
- Sidepanel: `lib/handlers/browserHandlers.ts`
- Sidepanel Action: `lib/actions/tabActions.ts`

---

### Communication Tools

#### `say`
**Purpose:** Speak text to the user via text-to-speech.

**AI Usage:**
```json
{ "type": "say", "args": { "text": "Hello, I've completed the task!" } }
```

**Frontend Flow:**
1. Sidepanel: `communicationHandler.execute()`
2. Calls: `lib/actions/pageActions.ts` → `speak()`
3. Calls: `callbacks.speak()` which uses the TTS engine

**Implementation:**
- Sidepanel: `lib/handlers/communicationHandlers.ts`
- Sidepanel Action: `lib/actions/pageActions.ts` → `speak()`
- TTS: `services/tts.ts`

---

#### `ask`
**Purpose:** Ask the user a question (currently same as `say`).

**AI Usage:**
```json
{ "type": "ask", "args": { "text": "What would you like me to do next?" } }
```

**Frontend Flow:** Same as `say`

**Implementation:**
- Sidepanel: `lib/handlers/communicationHandlers.ts`

---

### System Tools

#### `wait`
**Purpose:** Pause execution for a specified duration.

**AI Usage:**
```json
{ "type": "wait", "args": { "duration": 2000 } }
```

**Frontend Flow:**
1. Sidepanel: `systemHandler.execute()`
2. Calls: `setTimeout(duration)`

**Implementation:**
- Sidepanel: `lib/handlers/systemHandlers.ts`

---

#### `notify_plan`
**Purpose:** Display the AI's plan in the side panel UI.

**AI Usage:**
```json
{ "type": "notify_plan", "args": { "plan": "[>] 1. Search for cats\n[ ] 2. Click first result" } }
```

**Frontend Flow:**
1. Sidepanel: `systemHandler.execute()`
2. Calls: `callbacks.onPlan(planText)`
3. Updates UI to show plan

**Implementation:**
- Sidepanel: `lib/handlers/systemHandlers.ts`

---

## Backend Endpoint Reference

### POST `/conversation`
**Purpose:** Main endpoint for AI conversation.

**Request:**
```json
{
  "transcript": "Search for cats",
  "context": { /* DOM elements */ },
  "page_context": { "url": "...", "title": "...", "tabId": 1 },
  "conversation_id": "uuid-string"
}
```

**Response:**
```json
{
  "response": "I'll search for cats",
  "actions": [
    { "type": "notify_plan", "args": { "plan": "..." } },
    { "type": "search", "args": { "value": "cats" } }
  ],
  "requiresFollowUp": true,
  "conversation_id": "uuid-string"
}
```

**Implementation:** `backend/app/api/conversation.py`

---

### POST `/resolve-element`
**Purpose:** Convert element description to element ID using AI.

**Request:**
```json
{
  "dom_context": { /* DOM snapshot */ },
  "action_type": "click",
  "action_description": "Submit button",
  "action_value": null
}
```

**Response:**
```json
{
  "success": true,
  "element_id": "el-123"
}
```

**Implementation:** `backend/app/api/elements.py`

---

## Adding a New Tool

### Step 1: Decide Tool Category
Determine which handler category your tool belongs to:
- Browser operations → `browserHandlers.ts`
- Navigation → `navigationHandlers.ts`
- DOM extraction → `domHandlers.ts`
- Communication → `communicationHandlers.ts`
- System utilities → `systemHandlers.ts`
- Page interactions → `interactionHandlers.ts` (or create new handler)

### Step 2: Add to Backend Prompt
Edit `backend/app/core/prompts.py`:

```python
TOOLS (Actions):
- `your_tool(param: type)`: Description of what it does.
```

### Step 3: Implement Handler (Sidepanel)
Edit the appropriate handler in `extension/src/sidepanel/lib/handlers/`:

```typescript
export const yourHandler: ActionHandler = {
    canHandle: (type) => ['your_tool'].includes(type),
    execute: async (action, callbacks, context) => {
        // Your implementation
        return { success: true };
    }
};
```

### Step 4: Register Handler
Add to `extension/src/sidepanel/lib/handlers/index.ts`:

```typescript
import { yourHandler } from './yourHandler';

export const ACTION_HANDLERS: ActionHandler[] = [
    yourHandler,
    // ... existing handlers
];
```

### Step 5: (Optional) Add Content Script Function
If your tool needs direct DOM access, add to `extension/src/content/tools/actions/`:

```typescript
export function actionYourTool(param: string): ActionResult {
    // DOM manipulation
    return { success: true, message: "Done" };
}
```

Then register in `extension/src/content/tools/actionExecutor.ts`:

```typescript
case 'your_tool':
    return actionYourTool(action.param!);
```

### Step 6: Test
1. Restart backend server
2. Reload extension
3. Test via voice command or direct API call

---

## Troubleshooting

**Tool not working?**
1. Check backend logs for JSON parsing errors
2. Check browser console for handler errors
3. Verify tool is in `ACTION_HANDLERS` array
4. Ensure tool name matches between backend prompt and handler

**Element not found?**
1. Check if `fetch_dom` returned the element
2. Verify element is visible on page
3. Try using `description` instead of `elementId` to use AI resolution

**Content script not responding?**
1. Check if content script is injected (look for console logs)
2. Verify message type matches in `content/index.ts`
3. Check for restricted pages (chrome://, edge://)
