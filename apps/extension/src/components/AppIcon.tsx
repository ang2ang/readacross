import React from "react"

interface AppIconProps {
    size?: number
    /** Use white fills for dark backgrounds (e.g. purple header) */
    variant?: "color" | "white"
}

/** Inline SVG icon: 2+2 bilingual translation layout */
export function AppIcon({ size = 20, variant = "white" }: AppIconProps) {
    const grayFill = variant === "white" ? "rgba(255,255,255,0.6)" : "#64748b"
    const purpleFill = variant === "white" ? "#ffffff" : "#7c3aed"

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 1024 1024"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Original text: 2 lines */}
            <rect x="120" y="250" width="700" height="65" rx="32" fill={grayFill} />
            <rect x="120" y="380" width="540" height="65" rx="32" fill={grayFill} />

            {/* Translation: accent bar + 2 lines */}
            <rect x="120" y="540" width="24" height="230" rx="12" fill={purpleFill} />
            <rect x="190" y="546" width="610" height="65" rx="32" fill={purpleFill} />
            <rect x="190" y="680" width="460" height="65" rx="32" fill={purpleFill} />
        </svg>
    )
}
