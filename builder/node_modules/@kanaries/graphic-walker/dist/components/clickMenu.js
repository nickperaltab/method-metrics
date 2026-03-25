import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
const MenuContainer = styled.div `
    min-width: 100px;
    position: absolute;
    z-index: 99;
    cursor: pointer;
    padding: 4px;
`;
const ClickMenu = (props) => {
    const { x, y, children } = props;
    const [rect, setRect] = useState();
    const containerCb = useCallback((el) => {
        if (el) {
            setRect(el.getBoundingClientRect());
        }
    }, []);
    const left = x - (rect?.left ?? 0);
    const top = y - (rect?.top ?? 0);
    return (React.createElement("div", { ref: containerCb },
        React.createElement(MenuContainer, { className: "shadow-lg text-sm border rounded-md bg-popover text-popover-foreground border-border", style: { left, top } }, children)));
};
export default ClickMenu;
//# sourceMappingURL=clickMenu.js.map