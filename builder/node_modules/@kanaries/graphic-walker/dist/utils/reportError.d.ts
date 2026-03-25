import React from 'react';
export declare const Errors: {
    readonly canvasExceedSize: 500;
    readonly computationError: 501;
    readonly askVizError: 502;
};
export declare const errorContext: React.Context<{
    reportError: (message: string, code: (typeof Errors)[keyof typeof Errors]) => void;
}>;
export declare const useReporter: () => {
    reportError: (message: string, code: (typeof Errors)[keyof typeof Errors]) => void;
};
export declare const ErrorContext: React.Provider<{
    reportError: (message: string, code: (typeof Errors)[keyof typeof Errors]) => void;
}>;
