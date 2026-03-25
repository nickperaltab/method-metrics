import { GLOBAL_CONFIG } from '../config';
export function initEncoding() {
    return {
        dimensions: [],
        measures: [],
        rows: [],
        columns: [],
        color: [],
        opacity: [],
        size: [],
        shape: [],
        radius: [],
        theta: [],
        longitude: [],
        latitude: [],
        geoId: [],
        details: [],
        filters: [],
        text: [],
    };
}
export function initVisualConfig() {
    const [geom] = GLOBAL_CONFIG.GEOM_TYPES.generic;
    return {
        defaultAggregated: true,
        geoms: [geom],
        showTableSummary: false,
        coordSystem: 'generic',
        stack: 'stack',
        showActions: false,
        interactiveScale: false,
        sorted: 'none',
        zeroScale: true,
        scaleIncludeUnmatchedChoropleth: false,
        background: undefined,
        size: {
            mode: 'auto',
            width: 320,
            height: 200,
        },
        format: {
            numberFormat: undefined,
            timeFormat: undefined,
            normalizedNumberFormat: undefined,
        },
        geoKey: 'name',
        resolve: {
            x: false,
            y: false,
            color: false,
            opacity: false,
            shape: false,
            size: false,
        },
        limit: -1,
    };
}
export const emptyVisualLayout = {
    showActions: false,
    showTableSummary: false,
    stack: 'stack',
    interactiveScale: false,
    zeroScale: true,
    background: undefined,
    size: {
        mode: 'auto',
        width: 320,
        height: 200,
    },
    format: {
        numberFormat: undefined,
        timeFormat: undefined,
        normalizedNumberFormat: undefined,
    },
    geoKey: 'name',
    resolve: {
        x: false,
        y: false,
        color: false,
        opacity: false,
        shape: false,
        size: false,
    },
    renderer: 'vega-lite',
};
export const emptyVisualConfig = {
    defaultAggregated: true,
    geoms: [GLOBAL_CONFIG.GEOM_TYPES.generic[0]],
    coordSystem: 'generic',
    limit: -1,
};
export const emptyEncodings = {
    dimensions: [],
    measures: [],
    rows: [],
    columns: [],
    color: [],
    opacity: [],
    size: [],
    shape: [],
    radius: [],
    theta: [],
    longitude: [],
    latitude: [],
    geoId: [],
    details: [],
    filters: [],
    text: [],
};
export function visSpecDecoder(visSpec) {
    return {
        ...visSpec,
        encodings: {
            ...initEncoding(),
            ...visSpec.encodings,
        },
    };
}
export const forwardVisualConfigs = (content) => {
    return {
        ...content,
        config: {
            ...initVisualConfig(),
            ...content.config,
        },
    };
};
export function download(data, filename, type) {
    var file = new Blob([data], { type: type });
    // @ts-ignore
    if (window.navigator.msSaveOrOpenBlob)
        // IE10+
        // @ts-ignore
        window.navigator.msSaveOrOpenBlob(file, filename);
    else {
        // Others
        var a = document.createElement('a'), url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}
export function downloadBlob(blob, filename) {
    // @ts-ignore
    if (window.navigator.msSaveOrOpenBlob)
        // IE10+
        // @ts-ignore
        window.navigator.msSaveOrOpenBlob(blob, filename);
    else {
        // Others
        var a = document.createElement('a'), url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}
//# sourceMappingURL=save.js.map