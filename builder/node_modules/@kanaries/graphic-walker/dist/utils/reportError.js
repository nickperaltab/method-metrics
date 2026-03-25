import React from 'react';
export const Errors = {
    canvasExceedSize: 500,
    computationError: 501,
    askVizError: 502
};
export const errorContext = React.createContext({
    reportError: (() => { }),
});
export const useReporter = () => React.useContext(errorContext);
export const ErrorContext = errorContext.Provider;
//# sourceMappingURL=reportError.js.map