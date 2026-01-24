import React, { useEffect, useMemo } from 'react';
import { useFileStore } from '../../store/useFileStore';

interface TextViewerProps {
    fontSize: number;
}

export const TextViewer: React.FC<TextViewerProps> = ({ fontSize }) => {
    const { pastedText, setGetPageText } = useFileStore();

    // Set up getPageText function for "Translate Page" feature
    useEffect(() => {
        if (pastedText) {
            setGetPageText(async () => pastedText);
        }
        return () => setGetPageText(null);
    }, [pastedText, setGetPageText]);

    const fontSizeStyle = useMemo(() => ({
        fontSize: `${fontSize}%`,
    }), [fontSize]);

    if (!pastedText) return null;

    return (
        <div className="h-full overflow-auto p-8">
            <div
                className="max-w-3xl mx-auto prose prose-slate"
                style={fontSizeStyle}
            >
                <div className="whitespace-pre-wrap leading-relaxed text-slate-800">
                    {pastedText}
                </div>
            </div>
        </div>
    );
};
