import React from 'react';
const MAX_COLORS = 15;
export default function ColorPanel(props) {
    const { display, field, aggerated } = props;
    const fieldName = aggerated && field.analyticType === 'measure' && field.aggName ? `${field.aggName}(${field.name})` : field.name;
    return (React.createElement("div", { className: "absolute right-5 top-5 bg-popover/30 rounded p-2", style: { zIndex: 999 } },
        display.type === 'nominal' && (React.createElement("div", { className: "font-xs flex flex-col space-y-1" },
            React.createElement("div", { className: "font-medium max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap" }, fieldName),
            display.colors.slice(0, MAX_COLORS).map(({ name, color }) => {
                return (React.createElement("div", { className: "flex space-x-1 items-center", key: name },
                    React.createElement("div", { className: "w-3 h-3", style: { backgroundColor: color } }),
                    React.createElement("div", null, name)));
            }),
            display.colors.length > MAX_COLORS && (React.createElement("div", { className: "flex space-x-1 items-center" },
                React.createElement("div", { className: "w-3 h-3", style: { backgroundColor: display.colors[MAX_COLORS].color } }),
                React.createElement("div", null,
                    "...",
                    display.colors.length - MAX_COLORS,
                    " entries"))))),
        display.type === 'quantitative' && (React.createElement("div", { className: "font-xs flex flex-col space-y-1" },
            React.createElement("div", { className: "font-medium max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap" }, fieldName),
            React.createElement("div", { className: "flex space-x-1" },
                React.createElement("div", { className: "w-4 h-48", style: {
                        background: `linear-gradient(${[...display.color].reverse().join(',')})`,
                    } }),
                React.createElement("div", { className: "font-xs flex flex-col justify-between" },
                    React.createElement("div", null, Math.floor(display.domain[1])),
                    React.createElement("div", null, Math.floor(display.domain[1] * 0.75 + display.domain[0] * 0.25)),
                    React.createElement("div", null, Math.floor(display.domain[1] * 0.5 + display.domain[0] * 0.5)),
                    React.createElement("div", null, Math.floor(display.domain[1] * 0.25 + display.domain[0] * 0.75)),
                    React.createElement("div", null, Math.floor(display.domain[0]))))))));
}
//# sourceMappingURL=color.js.map