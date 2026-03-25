import React, { useEffect } from 'react';
import { getCircle } from '../../lib/paint';
import { ShadowDomContext } from '../../shadow-dom';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { StyledPicker } from '../color-picker';
import { ErrorBoundary } from 'react-error-boundary';
export const PixelCursor = (props) => {
    const { className, color, dia, factor, style } = props;
    const pixels = React.useMemo(() => {
        const result = new Array(dia).fill(0).map((_, i) => [i, Infinity, -1]);
        getCircle(dia).forEach(([x, y]) => {
            result[y][1] = Math.min(x, result[y][1]);
            result[y][2] = Math.max(x, result[y][1]);
        });
        return result.filter((x) => x[1] !== Infinity);
    }, [dia]);
    return (React.createElement("div", { className: className, style: style },
        React.createElement("div", { className: "relative", style: {
                width: factor * dia,
                height: factor * dia,
            } }, pixels.map(([y, from, to]) => (React.createElement("div", { className: "absolute", key: `cursor_${y}`, style: {
                background: color,
                width: (to - from + 1) * factor,
                height: factor,
                opacity: 0.6,
                top: y * factor,
                left: from * factor,
            } }))))));
};
export const PixelContainer = (props) => {
    const { color, cursor, offsetX, offsetY, children, showPreview } = props;
    const [cursorPos, setCursorPos] = React.useState(null);
    return (React.createElement("div", { className: "relative cursor-none", onMouseOut: () => setCursorPos(null), onMouseMoveCapture: (e) => setCursorPos([e.nativeEvent.offsetX, e.nativeEvent.offsetY]), onTouchMoveCapture: (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setCursorPos([e.changedTouches[0].pageX - rect.left, e.changedTouches[0].pageY - rect.top]);
        }, onTouchEnd: () => setCursorPos(null) },
        children,
        cursorPos !== null && cursor.type === 'rect' && (React.createElement(React.Fragment, null,
            React.createElement("div", { className: "absolute pointer-events-none", style: {
                    backgroundColor: color,
                    left: Math.floor((cursorPos[0] - offsetX) / cursor.xFactor) * cursor.xFactor +
                        offsetX -
                        ((cursor.x - (cursor.x % 2)) / 2) * cursor.xFactor,
                    top: Math.floor((cursorPos[1] - offsetY) / cursor.yFactor) * cursor.yFactor +
                        offsetY -
                        ((cursor.y - (cursor.y % 2)) / 2 - 1 + (cursor.y % 2)) * cursor.yFactor,
                    width: cursor.x * cursor.xFactor,
                    height: cursor.y * cursor.yFactor,
                    opacity: 0.6,
                } }),
            React.createElement("div", { className: "absolute pointer-events-none bg-primary", style: {
                    width: 16,
                    height: 16,
                    borderRadius: 16,
                    opacity: 0.4,
                    left: cursorPos[0] - 8,
                    top: cursorPos[1] - 8,
                } }))),
        showPreview && !cursorPos && cursor.type === 'rect' && (React.createElement("div", { className: "absolute pointer-events-none", style: {
                backgroundColor: color,
                width: cursor.x * cursor.xFactor,
                height: cursor.y * cursor.yFactor,
                opacity: 0.6,
                left: `calc(50% - ${((cursor.x - (cursor.x % 2)) / 2) * cursor.xFactor}px)`,
                top: `calc(50% - ${((cursor.y - (cursor.y % 2)) / 2) * cursor.yFactor}px)`,
            } })),
        cursorPos !== null && cursor.type === 'circle' && (React.createElement(PixelCursor, { className: "absolute pointer-events-none", color: color, factor: cursor.factor, dia: cursor.dia, style: {
                left: Math.floor((cursorPos[0] - offsetX) / cursor.factor) * cursor.factor +
                    offsetX -
                    ((cursor.dia - (cursor.dia % 2)) / 2) * cursor.factor,
                top: Math.floor((cursorPos[1] - offsetY) / cursor.factor) * cursor.factor +
                    offsetY -
                    ((cursor.dia - (cursor.dia % 2)) / 2 - 1 + (cursor.dia % 2)) * cursor.factor,
            } })),
        showPreview && !cursorPos && cursor.type === 'circle' && (React.createElement(PixelCursor, { className: "absolute pointer-events-none", color: color, factor: cursor.factor, dia: cursor.dia, style: {
                left: `calc(50% - ${((cursor.dia - (cursor.dia % 2)) / 2) * cursor.factor}px)`,
                top: `calc(50% - ${((cursor.dia - (cursor.dia % 2)) / 2) * cursor.factor}px)`,
            } }))));
};
export const ClickInput = (props) => {
    const [edit, setEdit] = React.useState(false);
    const doChange = (e) => {
        if (e.target.value)
            props.onChange(e.target.value);
        setEdit(false);
    };
    return edit ? (React.createElement(Input, { autoFocus: true, defaultValue: props.value, onBlur: doChange, onKeyUp: (e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                doChange(e);
                return false;
            }
            else {
                return true;
            }
        } })) : (React.createElement("label", { className: "px-3 py-1 text-sm transition-colors rounded hover:bg-accent leading-6", onClick: () => {
            setEdit(true);
        } }, props.value));
};
export const ColorEditor = (props) => {
    const [showColorEdit, setShowColorEdit] = React.useState(false);
    const [colorEdited, setColorEdited] = React.useState(false);
    const ref = React.useRef(null);
    const shadowDomMeta = React.useContext(ShadowDomContext);
    useEffect(() => {
        if (showColorEdit) {
            const listener = (e) => {
                if (e.target && !ref.current?.contains(e.target)) {
                    setShowColorEdit(false);
                }
            };
            const dom = shadowDomMeta.root;
            dom?.addEventListener('click', listener);
            return () => dom?.removeEventListener('click', listener);
        }
    }, [showColorEdit]);
    const [color, setColor] = React.useState(props.color);
    return (React.createElement(ErrorBoundary, { fallback: React.createElement("div", { className: "flex space-x-2" },
            React.createElement("div", { className: "w-4 h-4", style: { backgroundColor: props.color } }),
            React.createElement(Input, { value: props.color, onChange: (e) => {
                    props.onChangeColor(e.target.value);
                } })) },
        React.createElement("div", { className: "relative", ref: ref },
            React.createElement("div", { className: "w-8 h-5 border-2", style: { backgroundColor: props.color }, onClick: (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowColorEdit(true);
                    setColorEdited(false);
                    setColor(props.color);
                } }),
            showColorEdit && (React.createElement("div", { className: "absolute right-0 top-8 z-40 flex-col space-y-1 bg-popover shadow-lg rounded-md border" },
                React.createElement(StyledPicker, { presetColors: props.colors, color: color, onChange: (color) => {
                        setColorEdited(true);
                        setColor(color.hex);
                    }, noShadow: true, noBorder: true }),
                React.createElement("div", { className: "flex justify-end p-2" },
                    React.createElement(Button, { variant: "outline", children: "Save", onClick: () => {
                            setShowColorEdit(false);
                            if (colorEdited) {
                                props.onChangeColor(color);
                            }
                        } })))))));
};
//# sourceMappingURL=components.js.map