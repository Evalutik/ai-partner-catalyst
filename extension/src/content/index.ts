// Content script - injected into web pages for DOM extraction and action execution

// Message listener - responds to requests from popup/background
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; [key: string]: unknown },
    _sender,
    sendResponse
  ) => {
    if (message.type === "EXTRACT_DOM") {
      // Use clustered extraction for better token efficiency
      const clusteredDom = extractClusteredDOM();
      sendResponse({ success: true, data: clusteredDom });
    }

    if (message.type === "EXTRACT_DOM_LEGACY") {
      // Fallback to legacy extraction if needed
      const dom = extractDOM();
      sendResponse({ success: true, data: dom });
    }

    if (message.type === "EXECUTE_ACTION") {
      executeAction(message.action as Action).then((result) =>
        sendResponse(result)
      );
      return true; // async response
    }

    return true;
  }
);

/* data types */
interface ExtractedElement {
  id: string;
  tagName: string;
  type?: string;
  role?: string;
  text?: string;
  label?: string;
  placeholder?: string;
  alt?: string;
  value?: string;
  checked?: boolean;
  truncated?: boolean;
}

interface DOMSnapshot {
  url: string;
  title: string;
  elements: ExtractedElement[];
  message?: string;
}

interface ClusteredDOMSnapshot {
  url: string;
  title: string;
  viewport_summary: string;
  clusters: {
    navigation?: ElementCluster;
    forms?: ElementCluster;
    actions?: ElementCluster;
    content?: ElementCluster;
    media?: ElementCluster;
  };
  critical_elements: ExtractedElement[];
  total_elements_on_page: number;
}

interface ElementCluster {
  count: number;
  summary: string;
  items: Array<{
    id: string;
    label: string;
    type?: string;
  }>;
}

interface Action {
  type: "click" | "type" | "scroll" | "navigate" | "focus" | "search" | "read";
  elementId?: string;
  value?: string;
  waitForPage?: boolean;
  description?: string;
}

interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

const AEYES_ID_ATTR = "data-aeyes-id";
let elementCounter = 0;

// --- Helper Functions ---

function isVisible(el: HTMLElement): boolean {
  // This can be expensive, wrap in try/catch if needed, but it's usually safe on single elements
  if ((el as any).checkVisibility) {
    if (
      !(el as any).checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      })
    ) {
      return false;
    }
  }
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    style.opacity !== "0" &&
    style.pointerEvents !== "none" &&
    el.getAttribute("aria-hidden") !== "true"
  );
}

function getAeyesId(el: HTMLElement): string {
  let id = el.getAttribute(AEYES_ID_ATTR);
  if (!id) {
    id = `el-${++elementCounter}`;
    el.setAttribute(AEYES_ID_ATTR, id);
  }
  return id;
}

function getAssociatedLabel(el: HTMLElement): string | undefined {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.innerText.trim();
  }

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.id) {
      const labelFor = document.querySelector(
        `label[for="${el.id}"]`
      ) as HTMLElement;
      if (labelFor) return labelFor.innerText.trim();
    }
    const parentLabel = el.closest("label") as HTMLElement;
    if (parentLabel) return parentLabel.innerText.trim();
  }
  return el.title || undefined;
}

function findElementById(elementId: string): HTMLElement | null {
  return document.querySelector(
    `[${AEYES_ID_ATTR}="${elementId}"]`
  ) as HTMLElement | null;
}

// --- DOM Extraction Logic ---

function extractDOM(): DOMSnapshot {
  console.log("[Aeyes Content] Starting DOM extraction...");
  const startTime = performance.now();
  try {
    // 1. FAST SELECTORS: Interactive elements + Headings
    const interactiveSelectors = [
      "a",
      "button",
      "input",
      "select",
      "textarea",
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="treeitem"]',
      "[onclick]",
      '[contenteditable="true"]',
      '[tabindex]:not([tabindex="-1"])',
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "li",
    ].join(",");

    const candidateSet = new Set<HTMLElement>();

    const initial = document.querySelectorAll(interactiveSelectors);
    console.log(`[Aeyes Content] Initial selectors found: ${initial.length}`);

    initial.forEach((el) => {
      candidateSet.add(el as HTMLElement);
    });

    // 2. TREE WALKER: Efficiently find text nodes
    console.log("[Aeyes Content] Starting TreeWalker...");
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.textContent || node.textContent.trim().length < 3) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.parentElement) {
            const style = window.getComputedStyle(node.parentElement);
            if (style.display === "none" || style.visibility === "hidden") {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let currentNode;
    let textNodeCount = 0;
    while ((currentNode = walker.nextNode()) && textNodeCount < 2000) {
      textNodeCount++;
      if (currentNode.parentElement) {
        candidateSet.add(currentNode.parentElement);
      }
    }
    console.log(
      `[Aeyes Content] TreeWalker checked ${textNodeCount} text nodes. Total candidates: ${candidateSet.size}`
    );

    const allElements = Array.from(candidateSet);

    // Viewport Calculations
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    interface ScoredElement {
      el: HTMLElement;
      score: number;
    }

    const scoredElements: ScoredElement[] = [];
    let itemsChecked = 0;
    let skippedOffScreen = 0;
    let skippedInvisible = 0;

    console.log("[Aeyes Content] Starting Scoring Loop...");

    for (const el of allElements) {
      itemsChecked++;
      if (itemsChecked > 2000) break; // Hard stop

      const rect = el.getBoundingClientRect();

      // 1. FAST REJECTION
      if (rect.top > viewportHeight * 3 || rect.bottom < -viewportHeight * 3) {
        skippedOffScreen++;
        continue;
      }

      // 2. VISIBILITY CHECK (Expensive)
      if (!isVisible(el)) {
        skippedInvisible++;
        continue;
      }

      // Calculate distance from center of viewport
      const elCenterX = rect.left + rect.width / 2;
      const elCenterY = rect.top + rect.height / 2;
      const dist = Math.sqrt(
        Math.pow(elCenterX - centerX, 2) + Math.pow(elCenterY - centerY, 2)
      );

      let score = dist;

      // Penalty for being off-screen
      const isInViewport =
        rect.top >= -100 &&
        rect.left >= -100 &&
        rect.bottom <= viewportHeight + 100 &&
        rect.right <= viewportWidth + 100;

      if (!isInViewport) score += 10000;
      else score -= 500;

      // Penalty for massive wrappers
      if (rect.height > viewportHeight && rect.width > viewportWidth) {
        score += 5000;
      }

      scoredElements.push({ el, score });
    }

    console.log(
      `[Aeyes Content] Scoring done. Scored: ${scoredElements.length}. Skipped Off: ${skippedOffScreen}, Invis: ${skippedInvisible}`
    );

    // Sort by priority
    scoredElements.sort((a, b) => a.score - b.score);

    const extracted: ExtractedElement[] = [];
    const seenIds = new Set<string>();

    // STRICT LIMIT 100
    for (const item of scoredElements) {
      if (extracted.length >= 100) break;

      const el = item.el;
      const id = getAeyesId(el);
      if (seenIds.has(id)) continue;

      const textRaw = el.innerText?.trim();
      let displayText = textRaw;
      let wasTruncated = false;

      // Smart Truncation
      if (textRaw && textRaw.length > 150) {
        const sentences = textRaw.match(/[^\.!\?]+[\.!\?]+/g);
        if (sentences && sentences.length >= 2) {
          displayText = sentences.slice(0, 2).join(" ");
        } else {
          displayText = textRaw.substring(0, 150);
        }
        if (displayText.length > 180)
          displayText = displayText.substring(0, 180);

        displayText += " ...[truncated]";
        wasTruncated = true;
      }

      seenIds.add(id);

      const baseElement: any = {
        id: id,
        tagName: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || undefined,
        text: displayText ? displayText.substring(0, 200) : undefined,
        truncated: wasTruncated,
        label: getAssociatedLabel(el)?.substring(0, 100),
        placeholder:
          String((el as any).placeholder || "").substring(0, 100) || undefined,
        alt: String((el as any).alt || "").substring(0, 100) || undefined,
        value: String((el as any).value || "").substring(0, 100) || undefined,
        checked: (el as any).checked,
      };

      // Remove empty strings resulting from String(undefined) -> "undefined" ?? No, || '' handles it.
      // String(undefined || '') -> ''
      // String(null || '') -> ''
      // String(123 || '') -> '123'
      // Wait, String('') is empty string.
      // If empty string, we want undefined to save space?
      // Let's refine:
      const val = (el as any).value;
      baseElement.value =
        val !== null && val !== undefined && val !== ""
          ? String(val).substring(0, 100)
          : undefined;

      const ph = (el as any).placeholder;
      baseElement.placeholder =
        ph !== null && ph !== undefined && ph !== ""
          ? String(ph).substring(0, 100)
          : undefined;

      const alt = (el as any).alt;
      baseElement.alt =
        alt !== null && alt !== undefined && alt !== ""
          ? String(alt).substring(0, 100)
          : undefined;

      if (el instanceof HTMLInputElement) {
        extracted.push({ ...baseElement, type: el.type });
      } else {
        extracted.push(baseElement);
      }
    }

    console.log(
      `[Aeyes Content] Extraction COMPLETE in ${(
        performance.now() - startTime
      ).toFixed(2)}ms. Returning ${extracted.length} elements.`
    );

    return {
      url: window.location.href,
      title: document.title,
      elements: extracted,
      message: "DOM extraction (TreeWalker + Debug) completed",
    };
  } catch (e) {
    console.error("[Aeyes Content] CRITICAL EXTRACTION ERROR:", e);
    return {
      url: window.location.href,
      title: document.title,
      elements: [],
      message: `DOM extraction failed: ${e}`,
    };
  }
}

// --- Semantic Clustering with Accessibility Focus ---

function extractClusteredDOM(): ClusteredDOMSnapshot {
  console.log(
    "[Aeyes Content] Starting CLUSTERED DOM extraction with accessibility focus..."
  );
  const startTime = performance.now();

  try {
    // First, get elements using optimized extraction
    const rawSnapshot = extractDOM();
    const allElements = rawSnapshot.elements;

    // Categorize elements into semantic clusters
    const clusters: ClusteredDOMSnapshot["clusters"] = {
      navigation: { count: 0, summary: "", items: [] },
      forms: { count: 0, summary: "", items: [] },
      actions: { count: 0, summary: "", items: [] },
      content: { count: 0, summary: "", items: [] },
      media: { count: 0, summary: "", items: [] },
    };

    const critical: ExtractedElement[] = [];

    for (const el of allElements) {
      const role = el.role?.toLowerCase();
      const tag = el.tagName.toLowerCase();
      const text = (el.text || "").toLowerCase();
      const label = (el.label || "").toLowerCase();

      // NAVIGATION CLUSTER
      if (
        role === "navigation" ||
        tag === "nav" ||
        role === "menu" ||
        role === "menuitem" ||
        (tag === "a" &&
          (label.includes("home") ||
            label.includes("menu") ||
            label.includes("nav")))
      ) {
        clusters.navigation!.items.push({
          id: el.id,
          label: el.label || el.text || tag,
          type: tag,
        });
        clusters.navigation!.count++;
      }

      // FORMS CLUSTER
      else if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        role === "textbox" ||
        role === "combobox" ||
        role === "searchbox"
      ) {
        const formItem = {
          id: el.id,
          label: el.label || el.placeholder || el.role || "input field",
          type: (el as any).type || tag,
        };
        clusters.forms!.items.push(formItem);
        clusters.forms!.count++;

        // Critical: Search boxes and important inputs
        if (
          role === "searchbox" ||
          (el as any).type === "search" ||
          label.includes("search") ||
          (el.placeholder || "").toLowerCase().includes("search")
        ) {
          critical.push(el);
        }
      }

      // ACTIONS CLUSTER (buttons, clickable elements)
      else if (
        tag === "button" ||
        role === "button" ||
        (role === "link" && tag !== "a") // ARIA button links
      ) {
        clusters.actions!.items.push({
          id: el.id,
          label: el.label || el.text || "button",
          type: tag,
        });
        clusters.actions!.count++;

        // Critical: Primary action buttons
        if (
          text.includes("submit") ||
          text.includes("buy") ||
          text.includes("add to cart") ||
          text.includes("sign in") ||
          text.includes("search") ||
          text.includes("go") ||
          text.includes("continue")
        ) {
          critical.push(el);
        }
      }

      // MEDIA CLUSTER
      else if (
        tag === "img" ||
        tag === "video" ||
        tag === "audio" ||
        role === "img"
      ) {
        clusters.media!.items.push({
          id: el.id,
          label: el.alt || el.label || "media",
          type: tag,
        });
        clusters.media!.count++;
      }

      // CONTENT CLUSTER (headings, articles, links)
      else {
        // Only include meaningful content
        if (
          tag.match(/^h[1-6]$/) || // Headings
          role === "article" ||
          role === "heading" ||
          (tag === "a" && el.text && el.text.length > 0) || // Links with text
          (el.text && el.text.length > 20) // Significant text content
        ) {
          // Truncate content cluster items more aggressively
          const truncatedText = (el.text || el.label || "").substring(0, 50);
          clusters.content!.items.push({
            id: el.id,
            label: truncatedText + (truncatedText.length >= 50 ? "..." : ""),
            type: tag,
          });
          clusters.content!.count++;
        }
      }
    }

    // Generate summaries for each cluster
    if (clusters.navigation!.count > 0) {
      const navLabels = clusters
        .navigation!.items.slice(0, 5)
        .map((i) => i.label)
        .join(", ");
      clusters.navigation!.summary = `${
        clusters.navigation!.count
      } nav items: ${navLabels}${clusters.navigation!.count > 5 ? "..." : ""}`;
      // Limit navigation items to top 10
      clusters.navigation!.items = clusters.navigation!.items.slice(0, 10);
    } else {
      delete clusters.navigation;
    }

    if (clusters.forms!.count > 0) {
      const formLabels = clusters
        .forms!.items.slice(0, 5)
        .map((i) => `${i.label} (${i.type})`)
        .join(", ");
      clusters.forms!.summary = `${
        clusters.forms!.count
      } form fields: ${formLabels}${clusters.forms!.count > 5 ? "..." : ""}`;
      // Keep all form items (usually not too many)
      clusters.forms!.items = clusters.forms!.items.slice(0, 20);
    } else {
      delete clusters.forms;
    }

    if (clusters.actions!.count > 0) {
      const actionLabels = clusters
        .actions!.items.slice(0, 5)
        .map((i) => i.label)
        .join(", ");
      clusters.actions!.summary = `${
        clusters.actions!.count
      } buttons/actions: ${actionLabels}${
        clusters.actions!.count > 5 ? "..." : ""
      }`;
      // Keep top 15 actions
      clusters.actions!.items = clusters.actions!.items.slice(0, 15);
    } else {
      delete clusters.actions;
    }

    if (clusters.media!.count > 0) {
      clusters.media!.summary = `${clusters.media!.count} media items`;
      // Keep only first 5 media items
      clusters.media!.items = clusters.media!.items.slice(0, 5);
    } else {
      delete clusters.media;
    }

    if (clusters.content!.count > 0) {
      const headings = clusters.content!.items.filter((i) =>
        i.type?.match(/^h[1-6]$/)
      );
      const links = clusters.content!.items.filter((i) => i.type === "a");
      clusters.content!.summary = `${headings.length} headings, ${
        links.length
      } links, ${
        clusters.content!.count - headings.length - links.length
      } other`;
      // Keep top 20 content items
      clusters.content!.items = clusters.content!.items.slice(0, 20);
    } else {
      delete clusters.content;
    }

    // Generate viewport summary
    const viewport_summary = [
      document.title,
      clusters.forms ? "has forms" : "",
      clusters.actions ? `${clusters.actions.count} actions` : "",
      clusters.content ? "has content" : "",
    ]
      .filter(Boolean)
      .join(" | ");

    console.log(
      `[Aeyes Content] Clustered extraction COMPLETE in ${(
        performance.now() - startTime
      ).toFixed(2)}ms`
    );
    console.log(
      `[Aeyes Content] Clusters: Nav=${
        clusters.navigation?.count || 0
      }, Forms=${clusters.forms?.count || 0}, Actions=${
        clusters.actions?.count || 0
      }, Content=${clusters.content?.count || 0}, Media=${
        clusters.media?.count || 0
      }`
    );
    console.log(`[Aeyes Content] Critical elements: ${critical.length}`);

    return {
      url: rawSnapshot.url,
      title: rawSnapshot.title,
      viewport_summary,
      clusters,
      critical_elements: critical,
      total_elements_on_page: allElements.length,
    };
  } catch (e) {
    console.error("[Aeyes Content] CRITICAL CLUSTERED EXTRACTION ERROR:", e);
    return {
      url: window.location.href,
      title: document.title,
      viewport_summary: "Error extracting DOM",
      clusters: {},
      critical_elements: [],
      total_elements_on_page: 0,
    };
  }
}

// --- Actions ---

// Fallback Search Helper
function findElementByText(text: string): HTMLElement | null {
  if (!text) return null;
  const xpath = `//*[text()='${text}' or @aria-label='${text}' or @placeholder='${text}' or contains(text(), '${text}')]`;
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue as HTMLElement;
  } catch (e) {
    return null;
  }
}

function actionClick(elementId: string, description?: string): ActionResult {
  let element = findElementById(elementId);

  // Self-Healing: If ID not found but description exists, try to find by text
  if (!element && description) {
    console.warn(
      `[Aeyes] Element ${elementId} not found. Attempting self-healing with description: "${description}"`
    );
    element = findElementByText(description);
    if (element) {
      console.log(
        `[Aeyes] Self-healing successful! Found element by description.`
      );
    }
  }

  if (!element)
    return {
      success: false,
      message: `Element not found: ${elementId} (and fallback "${description}" failed)`,
    };

  try {
    element.focus();
    element.click();
    return { success: true, message: `Clicked element: ${elementId}` };
  } catch (e) {
    return { success: false, message: `Click failed: ${e}` };
  }
}

function actionType(elementId: string, text: string): ActionResult {
  const element = findElementById(elementId);
  if (!element)
    return { success: false, message: `Element not found: ${elementId}` };
  try {
    element.focus();
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (element.isContentEditable) {
      element.innerText = text;
      element.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: text })
      );
    }
    return { success: true, message: `Typed "${text}" into ${elementId}` };
  } catch (e) {
    return { success: false, message: `Type failed: ${e}` };
  }
}

function actionScroll(value: string): ActionResult {
  try {
    const scrollAmount = window.innerHeight * 0.8;
    if (value === "up")
      window.scrollBy({ top: -scrollAmount, behavior: "smooth" });
    else if (value === "down")
      window.scrollBy({ top: scrollAmount, behavior: "smooth" });
    else if (value === "top") window.scrollTo({ top: 0, behavior: "smooth" });
    else if (value === "bottom")
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    else {
      const element = findElementById(value);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        return { success: true, message: `Scrolled to element: ${value}` };
      }
      return { success: false, message: `Unknown scroll target: ${value}` };
    }
    return { success: true, message: `Scrolled ${value}` };
  } catch (e) {
    return { success: false, message: `Scroll failed: ${e}` };
  }
}

function actionNavigate(url: string): ActionResult {
  if (!url.startsWith("http")) url = "https://" + url;
  window.location.href = url;
  return { success: true, message: `Navigating to ${url}` };
}

function actionFocus(elementId: string): ActionResult {
  const element = findElementById(elementId);
  if (!element)
    return { success: false, message: `Element not found: ${elementId}` };
  element.focus();
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  return { success: true, message: `Focused ${elementId}` };
}

// Search Action
async function actionSearch(query: string): Promise<ActionResult> {
  if (!query) return { success: false, message: "Search query empty" };

  // 1. Try window.find (simple text search)
  if ((window as any).find && (window as any).find(query)) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const parent = range.commonAncestorContainer.parentElement;
      if (parent) {
        const id = getAeyesId(parent);
        parent.scrollIntoView({ behavior: "smooth", block: "center" });
        return {
          success: true,
          message: `Found text "${query}" and scrolled to it. Element ID: ${id}`,
        };
      }
    }
  }

  // 2. Fallback: XPath search
  try {
    const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${query.toLowerCase()}')]`;
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const node = result.singleNodeValue as HTMLElement;
    if (node) {
      const id = getAeyesId(node);
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return {
        success: true,
        message: `Found text "${query}" (via XPath) and scrolled. Element ID: ${id}`,
      };
    }
  } catch (e) {
    console.warn("XPath search failed:", e);
  }

  return { success: false, message: `Could not find text "${query}" on page.` };
}

// Read Action
function actionRead(elementId: string): ActionResult {
  const element = findElementById(elementId);
  if (!element)
    return { success: false, message: `Element not found: ${elementId}` };
  const fullText = element.innerText;
  return {
    success: true,
    message: `Read element ${elementId}`,
    data: { fullText: fullText },
  };
}

async function executeAction(action: Action): Promise<ActionResult> {
  console.log(
    "[Aeyes Content Script] Executing action:",
    action.description || action.type
  );

  switch (action.type) {
    case "click":
      return actionClick(action.elementId!, action.description);
    case "type":
      return actionType(action.elementId!, action.value!);
    case "scroll":
      return actionScroll(action.value!);
    case "navigate":
      return actionNavigate(action.value!);
    case "focus":
      return actionFocus(action.elementId!);
    case "search":
      return await actionSearch(action.value!);
    case "read":
      return actionRead(action.elementId!);
    default:
      return {
        success: false,
        message: `Unknown action: ${(action as any).type}`,
      };
  }
}

(window as any).extractDOM = extractDOM;
(window as any).extractClusteredDOM = extractClusteredDOM;
(window as any).executeAction = executeAction;
