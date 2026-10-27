const SCROLLING_CLASS = 'is-scrolling';
const MIN_SCROLL_RANGE = 6;
const HIDE_DELAY_MS = 900;

const hideTimers = new WeakMap<Element, number>();

function hasVerticalOverflow(element: Element) {
    return element.scrollHeight > element.clientHeight + MIN_SCROLL_RANGE;
}

function revealScrollbar(element: Element) {
    if (!element.classList.contains(SCROLLING_CLASS)) {
        element.classList.add(SCROLLING_CLASS);
    }
    const existing = hideTimers.get(element);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
        element.classList.remove(SCROLLING_CLASS);
        hideTimers.delete(element);
    }, HIDE_DELAY_MS);
    hideTimers.set(element, timer);
}

function findScrollableAncestor(target: EventTarget | null): Element | null {
    let node = target instanceof Element ? target : null;
    while (node && node !== document.documentElement) {
        if (hasVerticalOverflow(node)) return node;
        node = node.parentElement;
    }
    return null;
}

function handleScroll(event: Event) {
    const element = event.target;
    if (!(element instanceof Element)) return;
    if (!hasVerticalOverflow(element)) return;
    revealScrollbar(element);
}

function handlePointerOrWheel(event: Event) {
    const element = findScrollableAncestor(event.target);
    if (element) revealScrollbar(element);
}

let installed = false;

export function installScrollbarAutohide() {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    document.addEventListener('touchstart', handlePointerOrWheel, { capture: true, passive: true });
    document.addEventListener('touchmove', handlePointerOrWheel, { capture: true, passive: true });
    document.addEventListener('wheel', handlePointerOrWheel, { capture: true, passive: true });
}
