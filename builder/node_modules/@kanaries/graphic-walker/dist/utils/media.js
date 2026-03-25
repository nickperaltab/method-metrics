import { useEffect, useState } from "react";
export function currentMediaTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
    }
    else {
        return "light";
    }
}
export function useCurrentMediaTheme(mode = 'media') {
    const [theme, setTheme] = useState(mode === 'media' ? currentMediaTheme() : mode);
    useEffect(() => {
        if (mode === 'media') {
            const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
            const listener = (e) => {
                setTheme(e.matches ? "dark" : "light");
            };
            mediaQuery?.addEventListener("change", listener);
            return () => {
                mediaQuery?.removeEventListener("change", listener);
            };
        }
        else {
            setTheme(mode);
        }
    }, [mode]);
    return theme;
}
//# sourceMappingURL=media.js.map