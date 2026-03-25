import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheetManager } from 'styled-components';
import root from 'react-shadow';
import tailwindStyle from 'tailwindcss/tailwind.css?inline';
import style from './index.css?inline';
import { ColorConfigToCSS, zincTheme } from './utils/colors';
import { uiThemeContext } from './store/theme';
export const ShadowDomContext = createContext({ root: null });
export const ShadowDom = function ShadowDom({ onMount, onUnmount, children, uiTheme = zincTheme, ...attrs }) {
    const [shadowRoot, setShadowRoot] = useState(null);
    const rootRef = useRef(null);
    const onMountRef = useRef(onMount);
    onMountRef.current = onMount;
    const onUnmountRef = useRef(onUnmount);
    onUnmountRef.current = onUnmount;
    const colorStyle = useMemo(() => ColorConfigToCSS(uiTheme), [uiTheme]);
    useEffect(() => {
        if (rootRef.current) {
            const shadowRoot = rootRef.current.shadowRoot;
            setShadowRoot(shadowRoot);
            onMountRef.current?.(shadowRoot);
            return () => {
                onUnmountRef.current?.();
            };
        }
    }, []);
    return (React.createElement(root.div, { ...attrs, mode: "open", ref: rootRef },
        React.createElement(uiThemeContext.Provider, { value: uiTheme },
            React.createElement("style", null, tailwindStyle),
            React.createElement("style", null, style),
            React.createElement("style", null, colorStyle),
            React.createElement("link", { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=", crossOrigin: "" }),
            shadowRoot && (React.createElement(StyleSheetManager, { target: shadowRoot },
                React.createElement(ShadowDomContext.Provider, { value: { root: shadowRoot } }, children))))));
};
//# sourceMappingURL=shadow-dom.js.map