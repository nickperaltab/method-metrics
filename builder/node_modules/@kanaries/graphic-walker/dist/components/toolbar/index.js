import React, { memo, useState } from 'react';
import ToolbarItem, { ToolbarItemSplitter } from './toolbar-item';
import { Separator } from '../ui/separator';
const Toolbar = memo(function Toolbar({ items }) {
    const [openedKey, setOpenedKey] = useState(null);
    return (React.createElement("div", { className: "flex flex-wrap lg:flex-nowrap border my-1 w-full rounded overflow-hidden" }, items.map((item, i) => {
        if (item === ToolbarItemSplitter) {
            return React.createElement(Separator, { orientation: "vertical", className: "mx-1 my-1.5 h-6", key: i });
        }
        return React.createElement(ToolbarItem, { key: item.key, item: item, openedKey: openedKey, setOpenedKey: setOpenedKey });
    })));
});
export default Toolbar;
//# sourceMappingURL=index.js.map