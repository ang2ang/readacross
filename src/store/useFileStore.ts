import { create } from 'zustand';

interface FileState {
    file: File | null;
    fileType: 'pdf' | 'epub' | null;
    setFile: (file: File) => void;
    selection: string;
    setSelection: (selection: string) => void;
    getPageText: (() => Promise<string>) | null;
    setGetPageText: (fn: (() => Promise<string>) | null) => void;
    reset: () => void;
}

export const useFileStore = create<FileState>((set) => ({
    file: null,
    fileType: null,
    setFile: (file: File) => {
        const name = file.name.toLowerCase();
        const type = name.endsWith('.pdf') ? 'pdf' : name.endsWith('.epub') ? 'epub' : null;
        if (type) {
            set({ file, fileType: type });
        }
    },
    reset: () => set({ file: null, fileType: null, selection: '', getPageText: null }),
    selection: '',
    setSelection: (selection: string) => set({ selection }),
    getPageText: null,
    setGetPageText: (getPageText: (() => Promise<string>) | null) => set({ getPageText }),
}));

