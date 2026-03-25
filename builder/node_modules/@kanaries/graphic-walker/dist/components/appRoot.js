import React, { createContext, forwardRef, useImperativeHandle, useContext } from "react";
const AppRootContext = createContext(null);
export const useAppRootContext = () => {
    const context = useContext(AppRootContext);
    if (context && 'current' in context) {
        return context;
    }
    return {
        current: null,
    };
};
const AppRoot = forwardRef(({ children }, ref) => {
    useImperativeHandle(ref, () => {
        let renderStatus = 'idle';
        let onRenderStatusChangeHandlers = [];
        const addRenderStatusChangeListener = (cb) => {
            onRenderStatusChangeHandlers.push(cb);
            const dispose = () => {
                onRenderStatusChangeHandlers = onRenderStatusChangeHandlers.filter(which => which !== cb);
            };
            return dispose;
        };
        const updateRenderStatus = (status) => {
            if (renderStatus === status) {
                return;
            }
            renderStatus = status;
            onRenderStatusChangeHandlers.forEach(cb => cb(renderStatus));
        };
        return {
            get renderStatus() {
                return renderStatus;
            },
            onRenderStatusChange: addRenderStatusChangeListener,
            updateRenderStatus,
            chartCount: 1,
            chartIndex: 0,
            openChart() { },
            exportChart: (async (mode = 'svg') => {
                return {
                    mode,
                    title: '',
                    nCols: 0,
                    nRows: 0,
                    charts: [],
                    container: () => null,
                };
            }),
            exportChartList: (async function* exportChartList(mode = 'svg') {
                yield {
                    mode,
                    total: 1,
                    completed: 0,
                    index: 0,
                    data: {
                        mode,
                        title: '',
                        nCols: 0,
                        nRows: 0,
                        charts: [],
                        container: () => null,
                    },
                    hasNext: false,
                };
            }),
        };
    }, []);
    return (React.createElement(AppRootContext.Provider, { value: ref }, children));
});
export const withAppRoot = (Component) => {
    return (props) => {
        return (React.createElement(AppRoot, null,
            React.createElement(Component, { ...props })));
    };
};
export default AppRoot;
//# sourceMappingURL=appRoot.js.map