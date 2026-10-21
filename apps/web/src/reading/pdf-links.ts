import type { PDFDocumentProxy } from 'pdfjs-dist';

type LinkDocument = Pick<PDFDocumentProxy, 'getDestination' | 'getPageIndex' | 'getPageLabels' | 'numPages'>;

export async function pdfNamedLinkPage(pdf: LinkDocument, name: string): Promise<number | null> {
    const destination = await pdf.getDestination(name);
    if (destination) {
        const reference = destination[0];
        if (typeof reference !== 'number' && (!reference || typeof reference !== 'object'
            || !Number.isInteger(reference.num) || !Number.isInteger(reference.gen))) return null;
        const index = typeof reference === 'number' ? reference : await pdf.getPageIndex(reference);
        return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? index + 1 : null;
    }
    // Some books refer to page<label> without defining that named destination.
    // Resolve only against a unique label embedded in the PDF, including front matter.
    const label = /^page(.+)$/.exec(name)?.[1];
    if (!label) return null;
    const labels = await pdf.getPageLabels();
    if (!labels) return null;
    const index = labels.indexOf(label);
    if (index < 0 || index >= pdf.numPages || labels.indexOf(label, index + 1) >= 0) return null;
    return index + 1;
}
