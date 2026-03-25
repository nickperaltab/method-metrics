import React, { Fragment, memo, createContext, useState, useContext, useRef, useCallback, } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { useMenuButton } from './a11y';
import ActionMenuItemList from './list';
import { blockContext } from '../../fields/fieldsContext';
const Context = createContext(null);
const ActionMenu = (props) => {
    const { menu = [], disabled = false, enableContextMenu = false, title, ...attrs } = props;
    const [coord, setCoord] = useState([0, 0]);
    const buttonRef = useRef(null);
    const isDisabled = disabled || menu.length === 0;
    const block = useContext(blockContext);
    return (React.createElement(Menu, { as: Fragment }, ({ open, close }) => {
        return (React.createElement(Context.Provider, { value: {
                disabled,
                expanded: open,
                moveTo(cx, cy) {
                    const blockRect = block.current?.getBoundingClientRect();
                    const { x, y } = blockRect ?? { x: 0, y: 0 };
                    setCoord([cx - x, cy - y]);
                },
                open() {
                    if (!open) {
                        buttonRef.current?.click();
                    }
                },
                close,
                _items: menu,
            } },
            React.createElement(Menu.Button, { ref: buttonRef, className: "sr-only", "aria-hidden": true }),
            React.createElement("div", { onContextMenu: (e) => {
                    if (isDisabled)
                        return;
                    e.preventDefault();
                    e.stopPropagation();
                    const blockRect = block.current?.getBoundingClientRect();
                    const { x, y } = blockRect ?? { x: 0, y: 0 };
                    setCoord([e.clientX - x, e.clientY - y]);
                    if (!open) {
                        buttonRef.current?.click();
                    }
                }, ...attrs }, props.children),
            open && React.createElement("div", { className: "fixed inset-0 z-50 bg-transparent", "aria-hidden": "true" }),
            !isDisabled && React.createElement(Transition, { as: Fragment, enter: "transition ease-out duration-100", enterFrom: "transform opacity-0 scale-95", enterTo: "transform opacity-100 scale-100", leave: "transition ease-in duration-75", leaveFrom: "transform opacity-100 scale-100", leaveTo: "transform opacity-0 scale-95" },
                React.createElement(Menu.Items, { className: "fixed rounded-md z-50 mt-0.5 min-w-[8rem] max-w-[16rem] origin-top-left bg-popover text-popover-foreground shadow-lg border focus:outline-none", style: {
                        left: coord[0],
                        top: coord[1],
                    } },
                    React.createElement(ActionMenuItemList, { title: title, items: menu, onDismiss: close })))));
    }));
};
const ActionMenuButton = function ActionMenuButton(props) {
    const { as: _as = 'button', onPress, children, ...attrs } = props;
    const Component = _as;
    const ctx = useContext(Context);
    const buttonRef = useRef(null);
    const handlePress = useCallback(() => {
        if (ctx?.disabled) {
            return;
        }
        const btn = buttonRef.current;
        if (btn) {
            const rect = btn.getBoundingClientRect();
            ctx?.moveTo(rect.x + rect.width, rect.y);
        }
        if (onPress) {
            return onPress(ctx ?? undefined);
        }
        if (ctx?.expanded) {
            ctx.close();
        }
        else {
            ctx?.open();
        }
    }, [ctx, onPress]);
    const buttonProps = useMenuButton({
        ...attrs,
        'aria-expanded': ctx?.expanded ?? false,
        onPress: handlePress,
    });
    if (ctx?.disabled || !ctx?._items.length) {
        return React.createElement("div", { "aria-hidden": true });
    }
    return (
    // @ts-expect-error Expression produces a union type that is too complex to represent
    React.createElement(Component, { ...buttonProps, ref: buttonRef }, children));
};
export default Object.assign(ActionMenu, {
    Button: memo(ActionMenuButton),
});
//# sourceMappingURL=index.js.map