import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EpubView } from 'react-reader';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';

interface EpubViewerProps {
    fontSize?: number;
}

export const EpubViewer: React.FC<EpubViewerProps> = ({ fontSize = 100 }) => {
    const { file } = useFileStore();

    const [location, setLocation] = useState<string | number | null>(0); // Start at 0
    const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
    const renditionRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Read file as ArrayBuffer
    useEffect(() => {
        if (file instanceof Blob) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result instanceof ArrayBuffer) {
                    setBookData(e.target.result);
                }
            };
            reader.readAsArrayBuffer(file);
        }
    }, [file]);

    const locationChanged = (epubcifi: string | number) => {
        setLocation(epubcifi);
    };

    const getRendition = (rendition: any) => {
        renditionRef.current = rendition;

        const setFontSize = (size: number) => {
            rendition.themes.register('custom', {
                'body': {
                    'font-size': `${size}% !important`,
                },
                'p, li, blockquote, dd': {
                    'font-size': '1em !important',
                    'line-height': '1.5 !important'
                }
            });
            rendition.themes.select('custom');
        };

        // Set initial font size
        setFontSize(fontSize);

        // Handle selection
        rendition.on('selected', (_cfiRange: string, contents: any) => {
            const range = contents.window.getSelection().getRangeAt(0);
            const text = range.toString();
            if (text) {
                // Remove newlines and excess whitespace for better translation
                const cleanText = text.replace(/\s+/g, ' ').trim();
                useFileStore.getState().setSelection(cleanText);
            }
        });

        // Clear selection when changing location
        rendition.on('relocated', () => {
            useFileStore.getState().setSelection('');
        });
    };

    // Set extraction function in store
    useEffect(() => {
        const getPageText = async () => {
            if (!renditionRef.current) return '';
            try {
                const rendition = renditionRef.current;

                // Primary strategy: Use CFI range from currentLocation
                // This is the most reliable way to get current page text in epub.js
                const currentLoc = rendition.currentLocation();
                console.log('Current location:', currentLoc);

                if (currentLoc && currentLoc.start && currentLoc.end) {
                    try {
                        // Get the book object to access getRange
                        const book = rendition.book;
                        if (book) {
                            const startCfi = currentLoc.start.cfi;
                            const endCfi = currentLoc.end.cfi;
                            console.log('CFI range:', startCfi, 'to', endCfi);

                            // Try to get range using the book's spine
                            const range = await book.getRange(startCfi);
                            const endRange = await book.getRange(endCfi);

                            if (range && endRange) {
                                // Create a range that spans from start to end
                                const doc = range.startContainer.ownerDocument;
                                const fullRange = doc.createRange();
                                fullRange.setStart(range.startContainer, range.startOffset);
                                fullRange.setEnd(endRange.endContainer, endRange.endOffset);

                                const text = fullRange.toString();
                                console.log('Extracted text length:', text?.length);
                                if (text && text.trim().length > 0) {
                                    return text.trim();
                                }
                            }
                        }
                    } catch (err) {
                        console.warn('CFI range extraction failed:', err);
                    }
                }

                // Fallback: Get visible text from iframe using computed visibility
                const contents = rendition.getContents();
                if (!contents || contents.length === 0) return '';

                const content = contents[0];
                const doc = content.document;
                const win = content.window;

                // Get all text elements
                const textElements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, dd');
                const visibleTexts: string[] = [];

                textElements.forEach((el: Element) => {
                    const rect = el.getBoundingClientRect();

                    // Check if element is in the visible column
                    // In column layout, elements outside current column have negative or very large left values
                    const isInViewport =
                        rect.left >= -10 &&
                        rect.right <= win.innerWidth + 10 &&
                        rect.top >= -10 &&
                        rect.bottom <= win.innerHeight + 10;

                    if (isInViewport && rect.width > 0 && rect.height > 0) {
                        const text = (el as HTMLElement).innerText || el.textContent || '';
                        const trimmedText = text.trim();
                        if (trimmedText.length > 0 && !visibleTexts.includes(trimmedText)) {
                            visibleTexts.push(trimmedText);
                        }
                    }
                });

                if (visibleTexts.length > 0) {
                    return visibleTexts.join('\n\n').trim();
                }

                return '';
            } catch (err) {
                console.error('Error extracting epub page text:', err);
                return '';
            }
        };

        useFileStore.getState().setGetPageText(getPageText);
        return () => useFileStore.getState().setGetPageText(null);
    }, []);

    // Update font size
    useEffect(() => {
        if (renditionRef.current) {
            renditionRef.current.themes.register('custom', {
                'body': {
                    'font-size': `${fontSize}% !important`,
                },
                'p, li, blockquote, dd': {
                    'font-size': '1em !important',
                    'line-height': '1.5 !important'
                }
            });
            renditionRef.current.themes.select('custom');
        }
    }, [fontSize]);

    const handlePrev = useCallback(() => {
        renditionRef.current?.prev();
    }, []);

    const handleNext = useCallback(() => {
        renditionRef.current?.next();
    }, []);

    if (!bookData) return <div className="p-10 text-center">Reading file...</div>;

    return (
        <div className="h-full w-full bg-slate-50 relative flex flex-col">
            {/* Navigation Bar */}
            <div className="flex items-center justify-center gap-4 py-2 bg-white border-b border-slate-200 shrink-0 z-20 relative">
                <button
                    onClick={handlePrev}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors cursor-pointer select-none"
                >
                    <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <div className="h-4 w-px bg-slate-200" />
                <button
                    onClick={handleNext}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors cursor-pointer select-none"
                >
                    Next <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Reader Content */}
            <div className="flex-1 relative overflow-hidden h-full">
                <EpubView
                    url={bookData} // Pass ArrayBuffer directly by bypassing TS check if needed, or if types allow it
                    location={location}
                    locationChanged={locationChanged}
                    getRendition={getRendition}
                    loadingView={<div className="absolute inset-0 flex items-center justify-center text-slate-400">Loading...</div>}
                    epubOptions={{
                        flow: 'paginated',
                        manager: 'default',
                        allowScriptedContent: true, // Keep this true for safety
                        spread: 'none', // Force single column
                    }}
                    epubViewStyles={{
                        viewHolder: {
                            height: '100%',
                            overflow: 'hidden',
                        },
                        view: {
                            height: '100%',
                        },
                    }}
                />
            </div>
        </div>
    );
};
