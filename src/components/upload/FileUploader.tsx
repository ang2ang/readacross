import React, { useCallback, useState } from 'react';
import { Upload, FileType, AlertCircle } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';

export const FileUploader: React.FC = () => {
    const setFile = useFileStore((state) => state.setFile);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
        setError(null);

        const files = e.dataTransfer.files;
        if (files && files[0]) {
            const file = files[0];
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (ext === 'pdf' || ext === 'epub') {
                setFile(file);
            } else {
                setError('Only PDF and Epub files are supported.');
            }
        }
    }, [setFile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (ext === 'pdf' || ext === 'epub') {
                setFile(file);
            } else {
                setError('Only PDF and Epub files are supported.');
            }
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6">
            <div
                className={`relative border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center transition-all duration-200 ease-in-out
          ${isDragging
                        ? 'border-blue-500 bg-blue-50/50 scale-[1.02]'
                        : 'border-slate-200 hover:border-slate-300 bg-white shadow-sm'
                    }
        `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <div className={`p-4 rounded-full mb-4 ${isDragging ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Upload className="w-8 h-8" />
                </div>

                <h3 className="text-xl font-semibold text-slate-800 mb-2">
                    {isDragging ? 'Drop your file here' : 'Upload your book'}
                </h3>

                <p className="text-slate-500 mb-8 max-w-sm">
                    Drag and drop your PDF or EPUB file here, or click to browse from your computer.
                </p>

                <label className="relative">
                    <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.epub"
                        onChange={handleChange}
                    />
                    <span className="px-6 py-3 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors cursor-pointer shadow-lg shadow-slate-200">
                        Select File
                    </span>
                </label>

                {error && (
                    <div className="absolute bottom-4 flex items-center gap-2 text-red-500 text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-red-100 text-red-600 rounded-md">
                        <FileType className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                        <div className="font-medium text-slate-900">PDF Support</div>
                        <div className="text-xs text-slate-500">Full rendering with text selection</div>
                    </div>
                </div>
                <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center gap-3">
                    <div className="p-2 bg-orange-100 text-orange-600 rounded-md">
                        <FileType className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                        <div className="font-medium text-slate-900">EPUB Support</div>
                        <div className="text-xs text-slate-500">Reflowable layout reading</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
