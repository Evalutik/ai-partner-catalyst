import { PageStatus } from '../../types';

export function getPageStatus(): PageStatus {
    return {
        url: window.location.href,
        title: document.title,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        loading: document.readyState !== 'complete'
    };
}
