export interface ExtractedElement {
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

export interface DOMSnapshot {
    url: string;
    title: string;
    elements: ExtractedElement[];
    message?: string;
}

export interface Action {
    type: 'click' | 'type' | 'scroll' | 'navigate' | 'focus' | 'search' | 'read';
    elementId?: string;
    value?: string;
    waitForPage?: boolean;
    description?: string;
}

export interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

export interface PageStatus {
    url: string;
    title: string;
    scrollX: number;
    scrollY: number;
    windowWidth: number;
    windowHeight: number;
    loading: boolean;
}

export interface PageStructure {
    headers: string[];
    landmarks: string[];
    interactionPoints: number;
}

export interface ElementCluster {
    count: number;
    summary: string;
    items: Array<{
        id: string;
        label: string;
        type?: string;
    }>;
}

export interface ClusteredDOMSnapshot {
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
