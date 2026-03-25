import { classNames } from "../../utils";
import { useCallback, useMemo } from 'react';
export const useMenuButton = (options) => {
    const { ['aria-expanded']: expanded, onPress, disabled, className = '', ...attrs } = options;
    const onClick = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress?.();
    }, [onPress]);
    const onKeyDown = useCallback((e) => {
        switch (e.key) {
            case 'Enter':
            case 'Space': {
                onPress?.();
                break;
            }
            default: {
                return;
            }
        }
        e.preventDefault();
        e.stopPropagation();
    }, [onPress]);
    return useMemo(() => ({
        ...attrs,
        className: classNames(className, disabled
            ? 'cursor-default text-opacity-50'
            : 'cursor-pointer rounded-full focus:outline-none focus:ring-1 focus:ring-ring hover:bg-accent hover:text-accent-foreground', 'text-muted-foreground'),
        role: 'button',
        'aria-haspopup': 'menu',
        'aria-expanded': expanded,
        'aria-disabled': disabled,
        tabIndex: disabled ? undefined : 0,
        onClick,
        onKeyDown,
    }), [onClick, onKeyDown, expanded, disabled, className, attrs]);
};
//# sourceMappingURL=a11y.js.map