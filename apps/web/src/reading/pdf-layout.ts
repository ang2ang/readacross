// Keep the original Web reader's 100% baseline independent of the sidebar.
export const PDF_BASE_WIDTH = 800;

export function pdfPageWidth(available: number, zoom: number, fitWidth: boolean) {
    return Math.max(1, Math.round(fitWidth ? available : PDF_BASE_WIDTH * zoom / 100));
}

export function pdfCenterAnchor(viewportStart: number, viewportSize: number, pageStart: number, pageSize: number, previous = 0.5) {
    // Seeing the entire page must not replace a reading anchor with the blank margin.
    if (pageSize + 48 <= viewportSize) return previous;
    return Math.max(0, Math.min(1, (viewportStart + viewportSize / 2 - pageStart) / pageSize));
}

export function pdfCenterScroll(anchor: number, pageSize: number, viewportSize: number, padding = 24) {
    return Math.max(0, Math.min(pageSize + padding * 2 - viewportSize,
        padding + anchor * pageSize - viewportSize / 2));
}
