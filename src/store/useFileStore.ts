import { create } from 'zustand';

type InputMode = 'file' | 'text' | 'image';

interface ImageItem {
    url: string;
    extractedText: string | null;
}

interface FileState {
    file: File | null;
    fileType: 'pdf' | 'epub' | null;
    setFile: (file: File) => void;
    selection: string;
    setSelection: (selection: string) => void;
    getPageText: (() => Promise<string>) | null;
    setGetPageText: (fn: (() => Promise<string>) | null) => void;

    // Copy-paste support
    inputMode: InputMode;
    pastedText: string | null;

    // Multi-image support
    images: ImageItem[];
    currentImageIndex: number;
    setImages: (images: ImageItem[]) => void;
    setCurrentImageIndex: (index: number) => void;
    updateImageText: (index: number, text: string) => void;

    setInputMode: (mode: InputMode) => void;
    setPastedText: (text: string | null) => void;

    // Auto-translate flag
    pendingAutoTranslate: boolean;
    setPendingAutoTranslate: (value: boolean) => void;

    reset: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
    file: null,
    fileType: null,
    setFile: (file: File) => {
        const name = file.name.toLowerCase();
        const type = name.endsWith('.pdf') ? 'pdf' : name.endsWith('.epub') ? 'epub' : null;
        if (type) {
            set({ file, fileType: type, inputMode: 'file', pastedText: null, images: [], currentImageIndex: 0, pendingAutoTranslate: false });
        }
    },
    selection: '',
    setSelection: (selection: string) => set({ selection }),
    getPageText: null,
    setGetPageText: (getPageText: (() => Promise<string>) | null) => set({ getPageText }),

    // Copy-paste fields
    inputMode: 'file',
    pastedText: null,

    // Multi-image support
    images: [],
    currentImageIndex: 0,
    setImages: (images: ImageItem[]) => set({
        images,
        currentImageIndex: 0,
        inputMode: 'image',
        file: null,
        fileType: null,
        pastedText: null,
        pendingAutoTranslate: images.length > 0 && images[0].extractedText !== null
    }),
    setCurrentImageIndex: (currentImageIndex: number) => {
        const images = get().images;
        if (currentImageIndex >= 0 && currentImageIndex < images.length) {
            set({ currentImageIndex });
        }
    },
    updateImageText: (index: number, text: string) => {
        const images = [...get().images];
        if (index >= 0 && index < images.length) {
            images[index] = { ...images[index], extractedText: text };
            set({
                images,
                pendingAutoTranslate: index === get().currentImageIndex  // Auto-translate if updating current image
            });
        }
    },

    setInputMode: (inputMode: InputMode) => set({ inputMode }),
    setPastedText: (pastedText: string | null) => set({
        pastedText,
        inputMode: 'text',
        file: null,
        fileType: null,
        images: [],
        currentImageIndex: 0,
        pendingAutoTranslate: true
    }),

    // Auto-translate
    pendingAutoTranslate: false,
    setPendingAutoTranslate: (pendingAutoTranslate: boolean) => set({ pendingAutoTranslate }),

    reset: () => set({
        file: null,
        fileType: null,
        selection: '',
        getPageText: null,
        inputMode: 'file',
        pastedText: null,
        images: [],
        currentImageIndex: 0,
        pendingAutoTranslate: false
    }),
}));
