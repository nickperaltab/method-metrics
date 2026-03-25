import { makeAutoObservable, observable } from 'mobx';
import React, { createContext, useContext, useEffect } from 'react';
class PivotTableStore {
    leftTree = null;
    topTree = null;
    metricTable = [];
    dataSource = [];
    metas = [];
    viewData = [];
    constructor() {
        makeAutoObservable(this, {
            leftTree: observable.ref,
            topTree: observable.ref,
            metricTable: observable.ref,
            dataSource: observable.ref,
            metas: observable.ref,
        });
    }
    init(dataSource, metas) {
        this.dataSource = dataSource ?? [];
        this.metas = metas ?? [];
        this.leftTree = null;
        this.metricTable = [];
        this.topTree = null;
        this.viewData = [];
    }
}
const initStore = new PivotTableStore();
const PTContext = createContext(initStore);
export const PivotTableStoreWrapper = (props) => {
    const { data, metas } = props;
    useEffect(() => {
        initStore.init(data, metas);
    }, [data, metas]);
    return React.createElement(PTContext.Provider, { value: initStore }, props.children);
};
export function usePivotTableStore() {
    return useContext(PTContext);
}
//# sourceMappingURL=store.js.map