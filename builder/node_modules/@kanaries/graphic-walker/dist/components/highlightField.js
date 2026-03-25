import React from 'react';
export function highlightField(highlighter) {
    return React.forwardRef(function TextField({ placeholder, onChange, value }, ref) {
        const highlightValue = highlighter(value);
        return (React.createElement("div", { className: "relative flex min-h-[60px] w-full rounded-md border border-input bg-transparent text-sm shadow-sm" },
            React.createElement("div", { className: "absolute whitespace-pre inset-0 pointer-events-none px-3 py-2", dangerouslySetInnerHTML: { __html: highlightValue } }),
            placeholder && value === '' && (React.createElement("div", { className: "px-3 py-2 pointer-events-none text-muted-foreground absolute inset-0 select-none" }, placeholder)),
            React.createElement("div", { ref: ref, contentEditable: "plaintext-only", onInput: (e) => {
                    const text = e.currentTarget.textContent ?? '';
                    onChange?.(text);
                }, className: "px-3 py-2 w-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 rounded-md border-0 text-transparent caret-foreground" })));
    });
}
//# sourceMappingURL=highlightField.js.map