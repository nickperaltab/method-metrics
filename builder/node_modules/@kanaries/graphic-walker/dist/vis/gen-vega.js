import React, { useRef, useEffect, useState } from 'react';
import embed, { vega } from 'vega-embed';
const GenVega = (props) => {
    const { spec, dataSource, signalHandler = {} } = props;
    const container = useRef(null);
    const [view, setView] = useState();
    useEffect(() => {
        if (container.current) {
            embed(container.current, spec).then((res) => {
                setView(res.view);
            });
        }
    }, [spec]);
    useEffect(() => {
        if (view && signalHandler) {
            for (let key in signalHandler) {
                view.addSignalListener('sl', signalHandler[key]);
            }
        }
        return () => {
            if (view && signalHandler) {
                for (let key in signalHandler) {
                    view.removeSignalListener('sl', signalHandler[key]);
                }
            }
        };
    }, [view, signalHandler]);
    useEffect(() => {
        view &&
            view.change('dataSource', vega
                .changeset()
                .remove(() => true)
                .insert(dataSource));
        view && view.resize();
        view && view.runAsync();
    }, [view, dataSource]);
    return React.createElement("div", { ref: container });
};
export default GenVega;
//# sourceMappingURL=gen-vega.js.map