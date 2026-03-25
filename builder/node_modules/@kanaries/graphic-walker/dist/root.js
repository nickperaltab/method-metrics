import React, { forwardRef, useState } from 'react';
import { DOMProvider } from '@kanaries/react-beautiful-dnd';
import { observer } from 'mobx-react-lite';
import { VizAppWithContext } from './App';
import { ShadowDom } from './shadow-dom';
import AppRoot from './components/appRoot';
import './empty_sheet.css';
import { TableAppWithContext } from './Table';
import { RendererAppWithContext } from './Renderer';
export const GraphicWalker = observer(forwardRef((props, ref) => {
    const [shadowRoot, setShadowRoot] = useState(null);
    const handleMount = (shadowRoot) => {
        setShadowRoot(shadowRoot);
    };
    const handleUnmount = () => {
        setShadowRoot(null);
    };
    return (React.createElement(AppRoot, { ref: ref },
        React.createElement(ShadowDom, { className: props.className, style: props.style, onMount: handleMount, onUnmount: handleUnmount, uiTheme: props.uiTheme ?? props.colorConfig },
            React.createElement(DOMProvider, { value: { head: shadowRoot ?? document.head, body: shadowRoot ?? document.body } },
                React.createElement(VizAppWithContext, { ...props })))));
}));
export const GraphicRenderer = observer(forwardRef((props, ref) => {
    const [shadowRoot, setShadowRoot] = useState(null);
    const handleMount = (shadowRoot) => {
        setShadowRoot(shadowRoot);
    };
    const handleUnmount = () => {
        setShadowRoot(null);
    };
    return (React.createElement(AppRoot, { ref: ref },
        React.createElement(ShadowDom, { onMount: handleMount, onUnmount: handleUnmount, uiTheme: props.uiTheme ?? props.colorConfig },
            React.createElement(DOMProvider, { value: { head: shadowRoot ?? document.head, body: shadowRoot ?? document.body } },
                React.createElement(RendererAppWithContext, { ...props })))));
}));
export const TableWalker = observer(forwardRef((props, ref) => {
    const [shadowRoot, setShadowRoot] = useState(null);
    const handleMount = (shadowRoot) => {
        setShadowRoot(shadowRoot);
    };
    const handleUnmount = () => {
        setShadowRoot(null);
    };
    return (React.createElement(AppRoot, { ref: ref },
        React.createElement(ShadowDom, { style: props.style ?? {
                width: '100%',
                height: '100%',
            }, className: props.className, onMount: handleMount, onUnmount: handleUnmount, uiTheme: props.uiTheme ?? props.colorConfig },
            React.createElement(DOMProvider, { value: { head: shadowRoot ?? document.head, body: shadowRoot ?? document.body } },
                React.createElement(TableAppWithContext, { ...props })))));
}));
//# sourceMappingURL=root.js.map