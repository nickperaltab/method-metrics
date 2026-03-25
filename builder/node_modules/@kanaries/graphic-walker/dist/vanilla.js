import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import { createMemoryProvider } from './dataSourceProvider/memory';
import { DataSourceSegmentComponent } from './dataSource';
import { GraphicRenderer, GraphicWalker, TableWalker } from './root';
import PureRenderer from './renderer/pureRenderer';
function FullGraphicWalker(props) {
    const provider = useMemo(() => createMemoryProvider(), []);
    return (React.createElement(DataSourceSegmentComponent, { provider: provider, dark: props.dark, appearance: props.appearance, themeConfig: props.themeConfig, themeKey: props.themeKey, vizThemeConfig: props.vizThemeConfig, colorConfig: props.colorConfig, uiTheme: props.uiTheme }, (p) => {
        return React.createElement(GraphicWalker, { ...props, storeRef: p.storeRef, computation: p.computation, rawFields: p.meta, onMetaChange: p.onMetaChange });
    }));
}
const hasData = (props) => 'dataSource' in props || 'data' in props || 'computation' in props || 'rawFields' in props || 'fields' in props;
export function embedGraphicWalker(dom, props = {}) {
    if (!dom) {
        throw 'DOM element not found.';
    }
    // Example: Detect if Concurrent Mode is available
    const isConcurrentModeAvailable = 'createRoot' in ReactDOM;
    if (hasData(props)) {
        if (isConcurrentModeAvailable) {
            if (import.meta.env.DEV) {
                console.warn('React 18+ detected, remove strict mode if you meet drag and drop issue. more info at https://docs.kanaries.net/graphic-walker/faq/graphic-walker-react-18');
            }
            // @ts-ignore
            const root = ReactDOM.createRoot(dom);
            root.render(React.createElement(GraphicWalker, { themeKey: "g2", ...props }));
        }
        else {
            ReactDOM.render(React.createElement(React.StrictMode, null,
                React.createElement(GraphicWalker, { themeKey: "g2", ...props })), dom);
        }
        return;
    }
    // Use the new ReactDOM.createRoot API if available, otherwise fall back to the old ReactDOM.render API
    if (isConcurrentModeAvailable) {
        if (import.meta.env.DEV) {
            console.warn('React 18+ detected, remove strict mode if you meet drag and drop issue. more info at https://docs.kanaries.net/graphic-walker/faq/graphic-walker-react-18');
        }
        // @ts-ignore
        const root = ReactDOM.createRoot(dom);
        root.render(React.createElement(FullGraphicWalker, { themeKey: "g2", ...props }));
    }
    else {
        ReactDOM.render(React.createElement(React.StrictMode, null,
            React.createElement(FullGraphicWalker, { themeKey: "g2", ...props })), dom);
    }
}
export function embedGraphicRenderer(dom, props = {}) {
    if (!dom) {
        throw 'DOM element not found.';
    }
    // Example: Detect if Concurrent Mode is available
    const isConcurrentModeAvailable = 'createRoot' in ReactDOM;
    if (isConcurrentModeAvailable) {
        if (import.meta.env.DEV) {
            console.warn('React 18+ detected, remove strict mode if you meet drag and drop issue. more info at https://docs.kanaries.net/graphic-walker/faq/graphic-walker-react-18');
        }
        // @ts-ignore
        const root = ReactDOM.createRoot(dom);
        root.render(React.createElement(GraphicRenderer, { themeKey: "g2", ...props }));
    }
    else {
        ReactDOM.render(React.createElement(React.StrictMode, null,
            React.createElement(GraphicRenderer, { themeKey: "g2", ...props })), dom);
    }
}
export function embedTableWalker(dom, props = {}) {
    if (!dom) {
        throw 'DOM element not found.';
    }
    // Example: Detect if Concurrent Mode is available
    const isConcurrentModeAvailable = 'createRoot' in ReactDOM;
    if (isConcurrentModeAvailable) {
        if (import.meta.env.DEV) {
            console.warn('React 18+ detected, remove strict mode if you meet drag and drop issue. more info at https://docs.kanaries.net/graphic-walker/faq/graphic-walker-react-18');
        }
        // @ts-ignore
        const root = ReactDOM.createRoot(dom);
        root.render(React.createElement(TableWalker, { themeKey: "g2", ...props }));
    }
    else {
        ReactDOM.render(React.createElement(React.StrictMode, null,
            React.createElement(TableWalker, { themeKey: "g2", ...props })), dom);
    }
}
export function embedPureRenderer(dom, props) {
    if (!dom) {
        throw 'DOM element not found.';
    }
    // Example: Detect if Concurrent Mode is available
    const isConcurrentModeAvailable = 'createRoot' in ReactDOM;
    if (isConcurrentModeAvailable) {
        if (import.meta.env.DEV) {
            console.warn('React 18+ detected, remove strict mode if you meet drag and drop issue. more info at https://docs.kanaries.net/graphic-walker/faq/graphic-walker-react-18');
        }
        // @ts-ignore
        const root = ReactDOM.createRoot(dom);
        root.render(React.createElement(PureRenderer, { themeKey: "g2", ...props }));
    }
    else {
        ReactDOM.render(React.createElement(React.StrictMode, null,
            React.createElement(PureRenderer, { themeKey: "g2", ...props })), dom);
    }
}
//# sourceMappingURL=vanilla.js.map