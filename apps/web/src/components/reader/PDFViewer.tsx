import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

interface PDFViewerProps {
    fontSize?: number;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ fontSize = 100 }) => {
    const { file } = useFileStore();
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [pdf, setPdf] = useState<any>(null);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }, pdfDocument: any) {
        setNumPages(numPages);
        setPdf(pdfDocument);
    }

    // Set extraction function in store
    useEffect(() => {
        const getPageText = async () => {
            if (!pdf) return '';
            try {
                const page = await pdf.getPage(pageNumber);
                const textContent = await page.getTextContent();
                const textItems = textContent.items.map((item: any) => item.str);
                return textItems.join(' ');
            } catch (err) {
                console.error('Error extracting page text:', err);
                return '';
            }
        };

        useFileStore.getState().setGetPageText(getPageText);
        return () => useFileStore.getState().setGetPageText(null);
    }, [pdf, pageNumber]);

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is in an input field
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.key === 'ArrowLeft') {
                setPageNumber(prev => Math.max(1, prev - 1));
            } else if (e.key === 'ArrowRight' && numPages) {
                setPageNumber(prev => Math.min(numPages, prev + 1));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [numPages]);

    // Calculate page width based on fontSize percentage
    const pageWidth = Math.round(800 * (fontSize / 100));

    return (
        <div className="flex flex-col h-full w-full bg-slate-100">
            {/* Navigation Bar - Top */}
            {numPages && (
                <div className="flex items-center justify-center gap-4 py-2 bg-white border-b border-slate-200 shrink-0">
                    <button
                        disabled={pageNumber <= 1}
                        onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
                        className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                    </button>
                    <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg">
                        <input
                            type="number"
                            min={1}
                            max={numPages}
                            value={pageNumber}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1 && val <= numPages) {
                                    setPageNumber(val);
                                }
                            }}
                            className="w-14 text-center text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-400">/ {numPages}</span>
                    </div>
                    <button
                        disabled={pageNumber >= numPages}
                        onClick={() => setPageNumber(prev => Math.min(numPages!, prev + 1))}
                        className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Next
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* PDF Content */}
            <div className="flex-1 overflow-auto p-8 flex justify-center">
                <div className="shadow-lg">
                    <Document
                        file={file}
                        onLoadSuccess={(p) => onDocumentLoadSuccess(p, p)}
                        onLoadError={(err) => console.error('PDF Load Error:', err)}
                        onItemClick={({ pageNumber: targetPage }) => {
                            if (targetPage && typeof targetPage === 'number') {
                                setPageNumber(targetPage);
                            }
                        }}
                        loading={<div className="p-10 bg-white text-slate-500">Loading PDF...</div>}
                        error={<div className="p-10 bg-white text-red-500">Failed to load PDF. Please try another file.</div>}
                        className="flex flex-col gap-4"
                    >
                        <Page
                            pageNumber={pageNumber}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            width={pageWidth}
                            className="bg-white"
                        />
                    </Document>
                </div>
            </div>
        </div>
    );
};
