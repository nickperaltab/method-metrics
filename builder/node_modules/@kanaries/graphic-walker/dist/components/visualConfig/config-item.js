import React from 'react';
export function ConfigItemContainer(props) {
    return React.createElement("div", { className: "border p-4 m-4 rounded-lg" }, props.children);
}
export function ConfigItemContent(props) {
    return React.createElement("div", { className: "border-t mt-4 pt-4" }, props.children);
}
export function ConfigItemHeader(props) {
    return React.createElement("div", { className: "text-xs text-muted-foreground font-medium" }, props.children);
}
export function ConfigItemTitle(props) {
    return React.createElement("h2", { className: "text-xl text-foreground font-medium" }, props.children);
}
//# sourceMappingURL=config-item.js.map