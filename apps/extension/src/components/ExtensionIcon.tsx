export function ExtensionIcon({ size = 24, className }: { size?: number, className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 1024 1024"
            fill="none"
            className={className}
        >
            {/* Original text: 2 slate gray lines */}
            <rect x="120" y="290" width="650" height="52" rx="26" fill="#64748b" />
            <rect x="120" y="394" width="500" height="52" rx="26" fill="#64748b" />

            {/* Translation: purple accent bar + 2 purple lines */}
            <rect x="120" y="540" width="18" height="196" rx="9" fill="#7c3aed" />
            <rect x="176" y="546" width="560" height="52" rx="26" fill="#7c3aed" />
            <rect x="176" y="650" width="420" height="52" rx="26" fill="#7c3aed" />
        </svg>
    )
}
