import React from 'react';
export function composeContext(contexts) {
    return function (props) {
        let node = props.children;
        Object.keys(contexts).forEach((contextKey) => {
            const context = contexts[contextKey];
            node = React.createElement(context.Provider, { value: props[contextKey] }, node);
        });
        return node;
    };
}
//# sourceMappingURL=context.js.map