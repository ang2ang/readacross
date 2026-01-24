import React, { useState, useCallback, useRef } from 'react';
import { Upload, Loader2, ArrowRight, AlertCircle, RefreshCw, Images } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { useFileStore } from '../../store/useFileStore';

interface ImageFile {
    url: string;
    file: File;
}

export const ImageInputPanel: React.FC = () => {
    const { setImages } = useFileStore();
    const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractProgress, setExtractProgress] = useState(0);
    const [extractedText, setExtractedText] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageFiles = useCallback((files: FileList | File[]) => {
        const newImages: ImageFile[] = [];
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                newImages.push({
                    url: URL.createObjectURL(file),
                    file
                });
            }
        }
        if (newImages.length > 0) {
            setImageFiles(prev => [...prev, ...newImages]);
            setExtractedText(null);
            setError(null);
        } else {
            setError('Please select image files (PNG, JPG, WEBP, GIF)');
        }
    }, []);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) {
            handleImageFiles(e.dataTransfer.files);
        }
    }, [handleImageFiles]);

    const handlePaste = useCallback((e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        const files: File[] = [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }
        if (files.length > 0) {
            handleImageFiles(files);
        }
    }, [handleImageFiles]);

    React.useEffect(() => {
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [handlePaste]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleImageFiles(e.target.files);
        }
    };

    const handleExtractFirstImage = async () => {
        if (imageFiles.length === 0) return;

        setIsExtracting(true);
        setExtractProgress(0);
        setError(null);

        try {
            const worker = await createWorker('eng+chi_sim+chi_tra', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        setExtractProgress(Math.round(m.progress * 100));
                    }
                },
            });

            const { data: { text } } = await worker.recognize(imageFiles[0].url);
            await worker.terminate();

            if (text.trim()) {
                setExtractedText(text.trim());
            } else {
                setError('No text found in the first image. You can still proceed to view all images.');
            }
        } catch (err) {
            console.error('OCR failed:', err);
            setError('Failed to extract text. You can still proceed to view all images.');
        } finally {
            setIsExtracting(false);
            setExtractProgress(0);
        }
    };

    const handleSubmit = () => {
        // Convert to store format - first image has extracted text, others are null
        const storeImages = imageFiles.map((img, index) => ({
            url: img.url,
            extractedText: index === 0 ? extractedText : null
        }));
        setImages(storeImages);
    };

    const handleReset = () => {
        imageFiles.forEach(img => URL.revokeObjectURL(img.url));
        setImageFiles([]);
        setExtractedText(null);
        setError(null);
    };

    const removeImage = (index: number) => {
        URL.revokeObjectURL(imageFiles[index].url);
        setImageFiles(prev => prev.filter((_, i) => i !== index));
        if (index === 0) {
            setExtractedText(null);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6">
            {imageFiles.length === 0 ? (
                /* Drop Zone */
                <div
                    className={`relative border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center transition-all duration-200 ease-in-out ${isDragging
                        ? 'border-blue-500 bg-blue-50/50 scale-[1.02]'
                        : 'border-slate-200 hover:border-slate-300 bg-white shadow-sm'
                        }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    <div className={`p-4 rounded-full mb-4 ${isDragging ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                        <Images className="w-8 h-8" />
                    </div>

                    <h3 className="text-xl font-semibold text-slate-800 mb-2">
                        {isDragging ? 'Drop your images here' : 'Paste or Upload Images'}
                    </h3>

                    <p className="text-slate-500 mb-6 max-w-sm">
                        Paste images (⌘+V), drag & drop, or click to browse. <strong>Multiple images supported!</strong>
                    </p>

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        multiple
                        onChange={handleFileChange}
                    />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-6 py-3 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
                    >
                        Select Images
                    </button>
                </div>
            ) : (
                /* Image Preview & OCR */
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-center gap-2 text-slate-700 font-medium">
                            <Images className="w-4 h-4" />
                            {imageFiles.length} Image{imageFiles.length > 1 ? 's' : ''} Selected
                        </div>
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Clear All
                        </button>
                    </div>

                    {/* Image Gallery */}
                    <div className="p-4 bg-slate-50 border-b border-slate-100">
                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {imageFiles.map((img, index) => (
                                <div key={img.url} className="relative shrink-0 group">
                                    <img
                                        src={img.url}
                                        alt={`Image ${index + 1}`}
                                        className={`h-24 w-auto rounded-lg shadow-sm object-cover ${index === 0 ? 'ring-2 ring-blue-500' : ''}`}
                                    />
                                    {index === 0 && (
                                        <span className="absolute -top-2 -left-2 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">1st</span>
                                    )}
                                    <button
                                        onClick={() => removeImage(index)}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            {/* Add more button */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="h-24 w-20 shrink-0 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                            >
                                <span className="text-2xl">+</span>
                                <span className="text-xs">Add</span>
                            </button>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={handleFileChange}
                        />
                    </div>

                    {/* OCR Controls / Results */}
                    <div className="p-4">
                        {!extractedText && !isExtracting && (
                            <button
                                onClick={handleExtractFirstImage}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <Upload className="w-4 h-4" />
                                Extract Text from First Image
                            </button>
                        )}

                        {isExtracting && (
                            <div className="text-center py-4">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                                <p className="text-sm text-slate-600">Extracting text... {extractProgress}%</p>
                                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                                    <div
                                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                        style={{ width: `${extractProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {extractedText && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-2">Extracted Text (First Image)</label>
                                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 leading-relaxed max-h-32 overflow-auto border border-slate-200">
                                        {extractedText}
                                    </div>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 text-amber-600 text-sm mt-3 bg-amber-50 p-3 rounded-lg">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        {/* Submit button - always visible once images are selected */}
                        <button
                            onClick={handleSubmit}
                            disabled={isExtracting}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-4 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            {extractedText ? 'Start Translation' : 'View Images'}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Hint */}
            <p className="text-center text-sm text-slate-400 mt-4">
                Supports PNG, JPG, WEBP, GIF • Select multiple images to translate in sequence
            </p>
        </div>
    );
};
