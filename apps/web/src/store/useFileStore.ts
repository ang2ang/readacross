import { create } from 'zustand';

type InputMode = 'file' | 'text' | 'image';

interface ImageItem {
    url: string;
    extractedText: string | null;
}

interface UndoState {
    pastedText: string | null;
    images: ImageItem[];
    currentImageIndex: number;
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

    // Append content (for quick paste in reader)
    appendText: (text: string) => void;
    appendImage: (image: ImageItem) => void;

    // Track new content position for incremental translation
    newContentStart: number | null;
    clearNewContentStart: () => void;

    // Undo support
    undoState: UndoState | null;
    canUndo: boolean;
    undo: () => void;
    clearUndo: () => void;

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
            set({ file, fileType: type, inputMode: 'file', pastedText: null, images: [], currentImageIndex: 0, pendingAutoTranslate: false, undoState: null, canUndo: false });
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
        pendingAutoTranslate: images.length > 0 && images[0].extractedText !== null,
        undoState: null,
        canUndo: false
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
                pendingAutoTranslate: index === get().currentImageIndex
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
        pendingAutoTranslate: true,
        undoState: null,
        canUndo: false
    }),

    // Append text (with separator)
    appendText: (text: string) => {
        const state = get();
        // Save current state for undo
        const undoState: UndoState = {
            pastedText: state.pastedText,
            images: state.images,
            currentImageIndex: state.currentImageIndex
        };
        // Track where new content starts (after separator)
        const newContentStart = state.pastedText ? state.pastedText.length + 7 : 0; // 7 = length of "\n\n---\n\n"
        const newText = state.pastedText
            ? `${state.pastedText}\n\n---\n\n${text}`
            : text;
        set({
            pastedText: newText,
            inputMode: 'text',
            undoState,
            canUndo: true,
            pendingAutoTranslate: true,
            newContentStart
        });
    },

    // Append image (as new page)
    appendImage: (image: ImageItem) => {
        const state = get();
        // Save current state for undo
        const undoState: UndoState = {
            pastedText: state.pastedText,
            images: state.images,
            currentImageIndex: state.currentImageIndex
        };
        const newImages = [...state.images, image];
        set({
            images: newImages,
            currentImageIndex: newImages.length - 1, // Go to new image
            inputMode: 'image',
            undoState,
            canUndo: true,
            pendingAutoTranslate: image.extractedText !== null
        });
    },

    // Undo support
    undoState: null,
    canUndo: false,
    undo: () => {
        const state = get();
        if (state.undoState) {
            set({
                pastedText: state.undoState.pastedText,
                images: state.undoState.images,
                currentImageIndex: state.undoState.currentImageIndex,
                undoState: null,
                canUndo: false,
                pendingAutoTranslate: false
            });
        }
    },
    clearUndo: () => set({ undoState: null, canUndo: false }),

    // Track new content position
    newContentStart: null,
    clearNewContentStart: () => set({ newContentStart: null }),

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
        pendingAutoTranslate: false,
        undoState: null,
        canUndo: false,
        newContentStart: null
    }),
}));
