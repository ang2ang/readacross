import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EpubView } from 'react-reader';
import { ChevronLeft, ChevronRight, List, X } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';

interface TocItem {
    label: string;
    href: string;
    subitems?: TocItem[];
}

interface EpubViewerProps {
    fontSize?: number;
}

export const EpubViewer: React.FC<EpubViewerProps> = ({ fontSize = 100 }) => {
    const { file } = useFileStore();

    const [location, setLocation] = useState<string | number | null>(0);
    const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
    const [toc, setToc] = useState<TocItem[]>([]);
    const [showToc, setShowToc] = useState(false);
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

    const tocChanged = (newToc: TocItem[]) => {
        setToc(newToc);
    };

    const goToChapter = (href: string) => {
        renditionRef.current?.display(href);
        setShowToc(false);
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
                const cleanText = text.replace(/\s+/g, ' ').trim();
                useFileStore.getState().setSelection(cleanText);
            }
        });
    };

    // Set extraction function in store
    useEffect(() => {
        const getPageText = async () => {
            if (!renditionRef.current) return '';
            try {
                const rendition = renditionRef.current;
                const currentLoc = rendition.currentLocation();

                if (currentLoc && currentLoc.start && currentLoc.end) {
                    try {
                        const book = rendition.book;
                        if (book) {
                            const startCfi = currentLoc.start.cfi;
                            const endCfi = currentLoc.end.cfi;
                            const range = await book.getRange(startCfi);
                            const endRange = await book.getRange(endCfi);

                            if (range && endRange) {
                                const doc = range.startContainer.ownerDocument;
                                const fullRange = doc.createRange();
                                fullRange.setStart(range.startContainer, range.startOffset);
                                fullRange.setEnd(endRange.endContainer, endRange.endOffset);
                                const text = fullRange.toString();
                                if (text && text.trim().length > 0) {
                                    return text.trim();
                                }
                            }
                        }
                    } catch (err) {
                        console.warn('CFI range extraction failed:', err);
                    }
                }

                // Fallback: Get visible text from iframe
                const contents = rendition.getContents();
                if (!contents || contents.length === 0) return '';

                const content = contents[0];
                const doc = content.document;
                const win = content.window;
                const textElements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, dd');
                const visibleTexts: string[] = [];

                textElements.forEach((el: Element) => {
                    const rect = el.getBoundingClientRect();
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
                {/* TOC Toggle Button */}
                <button
                    onClick={() => setShowToc(!showToc)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer select-none ${showToc ? 'bg-blue-100 text-blue-600' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                    title="Table of Contents"
                >
                    <List className="w-4 h-4" />
                    TOC
                </button>

                <div className="h-4 w-px bg-slate-200" />

                <button
                    onClick={handlePrev}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors cursor-pointer select-none"
                >
                    <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <button
                    onClick={handleNext}
                    className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors cursor-pointer select-none"
                >
                    Next <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative overflow-hidden flex">
                {/* TOC Sidebar */}
                {showToc && (
                    <div className="w-72 bg-white border-r border-slate-200 overflow-y-auto shrink-0 z-10">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 sticky top-0">
                            <span className="text-sm font-semibold text-slate-700">Table of Contents</span>
                            <button
                                onClick={() => setShowToc(false)}
                                className="p-1 hover:bg-slate-200 rounded transition-colors"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        <nav className="py-2">
                            {toc.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-slate-400">No table of contents available</p>
                            ) : (
                                <ul className="space-y-0.5">
                                    {toc.map((item, index) => (
                                        <li key={index}>
                                            <button
                                                onClick={() => goToChapter(item.href)}
                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors truncate"
                                            >
                                                {item.label}
                                            </button>
                                            {item.subitems && item.subitems.length > 0 && (
                                                <ul className="pl-4">
                                                    {item.subitems.map((subitem, subIndex) => (
                                                        <li key={subIndex}>
                                                            <button
                                                                onClick={() => goToChapter(subitem.href)}
                                                                className="w-full text-left px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition-colors truncate"
                                                            >
                                                                {subitem.label}
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </nav>
                    </div>
                )}

                {/* Reader Content */}
                <div className="flex-1 relative overflow-hidden h-full">
                    <EpubView
                        url={bookData}
                        location={location}
                        locationChanged={locationChanged}
                        tocChanged={tocChanged}
                        getRendition={getRendition}
                        loadingView={<div className="absolute inset-0 flex items-center justify-center text-slate-400">Loading...</div>}
                        epubOptions={{
                            flow: 'paginated',
                            manager: 'default',
                            allowScriptedContent: true,
                            spread: 'none',
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
        </div>
    );
};
