import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Upload } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { useFileStore } from '../../store/useFileStore';

interface ImageTextViewerProps {
    fontSize: number;
}

export const ImageTextViewer: React.FC<ImageTextViewerProps> = ({ fontSize }) => {
    const { images, currentImageIndex, setCurrentImageIndex, updateImageText, setGetPageText, setPendingAutoTranslate } = useFileStore();
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractProgress, setExtractProgress] = useState(0);

    const currentImage = images[currentImageIndex];
    const hasText = currentImage?.extractedText !== null;
    const totalImages = images.length;

    // Set up getPageText function for "Translate Page" feature
    useEffect(() => {
        if (currentImage?.extractedText) {
            setGetPageText(async () => currentImage.extractedText!);
        } else {
            setGetPageText(null);
        }
        return () => setGetPageText(null);
    }, [currentImage?.extractedText, setGetPageText]);

    const fontSizeStyle = useMemo(() => ({
        fontSize: `${fontSize}%`,
    }), [fontSize]);

    const handlePrev = () => {
        if (currentImageIndex > 0) {
            setCurrentImageIndex(currentImageIndex - 1);
        }
    };

    const handleNext = () => {
        if (currentImageIndex < totalImages - 1) {
            setCurrentImageIndex(currentImageIndex + 1);
        }
    };

    const handleExtractText = async () => {
        if (!currentImage) return;

        setIsExtracting(true);
        setExtractProgress(0);

        try {
            const worker = await createWorker('eng+chi_sim+chi_tra', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        setExtractProgress(Math.round(m.progress * 100));
                    }
                },
            });

            const { data: { text } } = await worker.recognize(currentImage.url);
            await worker.terminate();

            if (text.trim()) {
                updateImageText(currentImageIndex, text.trim());
                setPendingAutoTranslate(true);  // Trigger auto-translate
            }
        } catch (err) {
            console.error('OCR failed:', err);
        } finally {
            setIsExtracting(false);
            setExtractProgress(0);
        }
    };

    if (!currentImage) return null;

    return (
        <div className="h-full flex flex-col">
            {/* Pagination Header */}
            {totalImages > 1 && (
                <div className="flex items-center justify-center gap-4 py-2 bg-slate-50 border-b border-slate-200">
                    <button
                        onClick={handlePrev}
                        disabled={currentImageIndex === 0}
                        className="p-1.5 hover:bg-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-medium text-slate-600">
                        Image {currentImageIndex + 1} of {totalImages}
                    </span>
                    <button
                        onClick={handleNext}
                        disabled={currentImageIndex === totalImages - 1}
                        className="p-1.5 hover:bg-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                <div className="grid grid-cols-2 gap-4 p-6 h-full">
                    {/* Left: Image */}
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex items-center justify-center overflow-hidden">
                        <img
                            src={currentImage.url}
                            alt={`Image ${currentImageIndex + 1}`}
                            className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                        />
                    </div>

                    {/* Right: Extracted Text or OCR Button */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                            <span className="text-sm font-medium text-slate-600">
                                {hasText ? 'Extracted Text' : 'Text Not Extracted'}
                            </span>
                        </div>
                        <div className="flex-1 overflow-auto p-4" style={fontSizeStyle}>
                            {hasText ? (
                                <div className="whitespace-pre-wrap leading-relaxed text-slate-800">
                                    {currentImage.extractedText}
                                </div>
                            ) : isExtracting ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                                    <p className="text-slate-600 mb-2">Extracting text... {extractProgress}%</p>
                                    <div className="w-48 bg-slate-200 rounded-full h-1.5">
                                        <div
                                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                            style={{ width: `${extractProgress}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <p className="text-slate-500 mb-4">This image hasn't been processed yet.</p>
                                    <button
                                        onClick={handleExtractText}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Extract Text
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
