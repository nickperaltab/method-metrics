import React, { Fragment, memo, createContext, useState, useContext, useMemo, useEffect } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import styled from 'styled-components';
import { Transition } from '@headlessui/react';
import { Separator } from '../ui/separator';
function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}
const List = styled.div `
    display: grid;
    grid-template-columns: max-content 1fr max-content;
    & > div {
        /* row */
        display: contents;
        > * {
            background: inherit;
            cursor: pointer;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            overflow: hidden;
            padding-block: 0.2rem;
            padding-inline: 0.2rem;
            &:first-child {
                padding-left: 0.4rem;
            }
        }
        > *:first-child {
            border-top-left-radius: calc(var(--radius) - 4px);
            border-bottom-left-radius: calc(var(--radius) - 4px);
        }
        > *:last-child {
            border-top-right-radius: calc(var(--radius) - 4px);
            border-bottom-right-radius: calc(var(--radius) - 4px);
        }
        &[aria-disabled='true'] > * {
            opacity: 0.5;
            cursor: default;
        }
    }
`;
const Context = createContext(null);
const ActionMenuItem = memo(function ActionMenuItem({ item, path }) {
    const { icon, label, disabled = false, children = [], onPress } = item;
    const [hover, setHover] = useState(false);
    const [focus, setFocus] = useState(false);
    const ctx = useContext(Context);
    const expanded = children.length > 0 && ctx.path.length > 0 && path.length <= ctx.path.length && path.every((v, i) => v === ctx.path[i]);
    const active = !disabled && (hover || focus || expanded);
    const basePath = useMemo(() => {
        let idx = ctx.path.findIndex((v, i) => v !== path[i]);
        if (idx !== -1) {
            return ctx.path.slice(0, idx);
        }
        return ctx.path;
    }, [ctx.path, path]);
    useEffect(() => {
        if (children.length === 0 && (hover || focus)) {
            if (basePath.join('.') !== ctx.path.join('.')) {
                ctx.setPath(basePath);
            }
        }
    }, [children.length, hover, focus, ctx, basePath]);
    return (React.createElement("div", { tabIndex: disabled ? undefined : 0, role: "button", "aria-haspopup": children.length ? 'menu' : undefined, "aria-disabled": disabled, className: classNames(active ? 'bg-accent text-accent-foreground' : 'text-foreground', disabled ? 'text-muted-foreground' : 'cursor-pointer', 'transition-colors text-xs'), onClick: (e) => {
            if (disabled || children.length) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            if (!disabled) {
                onPress?.();
                ctx.onDismiss();
            }
        }, onFocus: () => {
            if (!disabled) {
                setFocus(true);
            }
            if (children.length && !expanded) {
                ctx.setPath(path);
            }
        }, onBlur: () => {
            setFocus(false);
        }, onMouseEnter: () => {
            setHover(true);
            if (children.length && !expanded && !disabled) {
                ctx.setPath(path);
            }
        }, onMouseLeave: () => {
            setHover(false);
        }, onKeyDown: (e) => {
            if (disabled || children.length) {
                return;
            }
            if (e.key === 'Enter' || e.key === 'Space') {
                onPress?.();
                ctx.onDismiss();
            }
        } },
        React.createElement("div", { "aria-hidden": "true" }, icon),
        React.createElement("div", null,
            React.createElement("span", { className: "truncate self-start" }, label)),
        React.createElement("div", { "aria-hidden": "true", className: "relative" }, children.length > 0 && (React.createElement(React.Fragment, null,
            React.createElement(ChevronRightIcon, { className: "w-4 h-4", "aria-hidden": "true" }),
            React.createElement("div", { className: "absolute top-0 right-0" },
                React.createElement(Transition, { appear: true, as: Fragment, show: expanded, enter: "transition ease-out duration-100", enterFrom: "transform opacity-0 scale-95", enterTo: "transform opacity-100 scale-100", leave: "transition ease-in duration-75", leaveFrom: "transform opacity-100 scale-100", leaveTo: "transform opacity-0 scale-95" },
                    React.createElement("div", { className: "fixed rounded-md -translate-x-1 z-50 min-w-[8rem] max-w-[16rem] bg-popover shadow-lg border focus:outline-none" },
                        React.createElement(MenuItemList, { items: children, path: path })))))))));
});
const MenuItemList = memo(function ActionMenuItemList({ items, path, title }) {
    return (React.createElement("div", { className: "p-1 -mx-px" },
        title && React.createElement("header", { className: "px-3 py-1 mb-1.5 text-xs font-medium truncate" }, title),
        title && React.createElement(Separator, { orientation: "horizontal", className: "-mx-1 my-1" }),
        React.createElement(List, null, items.map((item, index) => (React.createElement(ActionMenuItem, { key: index, item: item, path: [...path, index] }))))));
});
const ActionMenuItemRoot = memo(function ActionMenuItemRoot({ onDismiss, children }) {
    const [path, setPath] = useState([]);
    return React.createElement(Context.Provider, { value: { path, setPath, onDismiss } }, children);
});
export default memo(function ActionMenuItemList({ onDismiss, items, title }) {
    return (React.createElement(ActionMenuItemRoot, { onDismiss: onDismiss },
        React.createElement(MenuItemList, { title: title, items: items, path: [] })));
});
//# sourceMappingURL=list.js.map