import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Tooltip, CircleMarker, AttributionControl } from 'react-leaflet';
import { getMeaAggKey } from '../../utils';
import { useColorScale, useOpacityScale, useSizeScale } from './encodings';
import { TooltipContent } from './tooltip';
import { useAppRootContext } from '../appRoot';
import { ChangeView } from './utils';
import ColorPanel from './color';
export const isValidLatLng = (latRaw, lngRaw) => {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};
const formatCoerceLatLng = (latRaw, lngRaw) => {
    return `${typeof latRaw === 'number' ? latRaw : JSON.stringify(latRaw)}, ${typeof lngRaw === 'number' ? lngRaw : JSON.stringify(lngRaw)}`;
};
const debugMaxLen = 20;
const POIRenderer = forwardRef(function POIRenderer(props, ref) {
    const { name, data, allFields, latitude, longitude, color, opacity, size, details, defaultAggregated, vegaConfig, scales, tileUrl } = props;
    const lngLat = useMemo(() => {
        if (longitude && latitude) {
            return data
                .map((row) => [Number(row[latitude.fid]), Number(row[longitude.fid])])
                .filter((v) => isValidLatLng(v[0], v[1]));
        }
        return [];
    }, [longitude, latitude, data]);
    const [bounds, center] = useMemo(() => {
        if (lngLat.length > 0) {
            const [bounds, coords] = lngLat.reduce(([bounds, acc], [lat, lng]) => {
                if (lat < bounds[0][0]) {
                    bounds[0][0] = lat;
                }
                if (lat > bounds[1][0]) {
                    bounds[1][0] = lat;
                }
                if (lng < bounds[0][1]) {
                    bounds[0][1] = lng;
                }
                if (lng > bounds[1][1]) {
                    bounds[1][1] = lng;
                }
                return [bounds, [acc[0] + lng, acc[1] + lat]];
            }, [
                [[...lngLat[0]], [...lngLat[0]]],
                [0, 0],
            ]);
            return [bounds, [coords[0] / lngLat.length, coords[1] / lngLat.length]];
        }
        return [
            [
                [-180, -90],
                [180, 90],
            ],
            [0, 0],
        ];
    }, [lngLat]);
    const mapRef = useRef(null);
    useEffect(() => {
        const container = mapRef.current?.getContainer();
        if (container) {
            const ro = new ResizeObserver(() => {
                mapRef.current?.invalidateSize();
            });
            ro.observe(container);
            return () => {
                ro.unobserve(container);
            };
        }
    });
    const appRef = useAppRootContext();
    useEffect(() => {
        const ctx = appRef.current;
        if (ctx) {
            ctx.exportChart = async (mode) => ({
                mode,
                title: name || 'untitled',
                nCols: 0,
                nRows: 0,
                charts: [],
                container: () => mapRef.current?.getContainer() ?? null,
                chartType: 'map',
            });
        }
    }, []);
    const sizeScale = useSizeScale(data, size, defaultAggregated, scales);
    const opacityScale = useOpacityScale(data, opacity, defaultAggregated, scales);
    const { mapper: colorScale, display: colorDisplay } = useColorScale(data, color, defaultAggregated, vegaConfig);
    const tooltipFields = useMemo(() => {
        return details.concat([size, color, opacity].filter(Boolean)).map((f) => ({
            ...f,
            key: defaultAggregated && f.analyticType === 'measure' && f.aggName ? getMeaAggKey(f.fid, f.aggName) : f.fid,
        }));
    }, [defaultAggregated, details, size, color, opacity]);
    const points = useMemo(() => {
        if (Boolean(latitude && longitude)) {
            const failedLatLngList = [];
            const result = data.flatMap((row, i) => {
                const lat = row[latitude.fid];
                const lng = row[longitude.fid];
                if (!isValidLatLng(lat, lng)) {
                    failedLatLngList.push([i, lat, lng]);
                    return [];
                }
                const radius = sizeScale(row);
                const opacity = opacityScale(row);
                const color = colorScale(row);
                return [
                    {
                        key: `${i}-${radius}-${opacity}-${color}`,
                        center: [Number(lat), Number(lng)],
                        radius,
                        opacity,
                        color,
                        row,
                    },
                ];
            });
            if (failedLatLngList.length > 0) {
                console.warn(`Failed to render ${failedLatLngList.length.toLocaleString()} markers of ${data.length.toLocaleString()} rows due to invalid lat/lng.\n--------\n${`${failedLatLngList
                    .slice(0, debugMaxLen)
                    .map(([idx, lat, lng]) => `[${idx + 1}] ${formatCoerceLatLng(lat, lng)}`)
                    .join('\n')}` +
                    (failedLatLngList.length > debugMaxLen ? `\n\t... and ${(failedLatLngList.length - debugMaxLen).toLocaleString()} more` : '')}\n`);
            }
            return result;
        }
        else {
            return [];
        }
    }, [latitude, longitude, data, sizeScale, opacityScale, colorScale]);
    return (React.createElement(MapContainer, { attributionControl: false, center: center, ref: mapRef, zoom: 5, bounds: bounds, preferCanvas: true, style: { width: '100%', height: '100%', zIndex: 1 } },
        React.createElement(ChangeView, { bounds: bounds }),
        tileUrl === undefined && (React.createElement(TileLayer, { className: "map-tile", attribution: '\u00A9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" })),
        tileUrl && React.createElement(TileLayer, { className: "map-tile", url: tileUrl }),
        React.createElement(AttributionControl, { prefix: "Leaflet" }),
        points.map(({ key, center, radius, opacity, color, row }) => {
            return (React.createElement(CircleMarker, { key: key, center: center, radius: radius, opacity: 0.8, fillOpacity: opacity, fillColor: color, color: "#00000022", stroke: true, weight: 1, fill: true }, tooltipFields.length > 0 && (React.createElement(Tooltip, null, tooltipFields.map((f, j) => (React.createElement(TooltipContent, { key: j, allFields: allFields, vegaConfig: vegaConfig, field: f, value: row[f.key] })))))));
        }),
        colorDisplay && React.createElement(ColorPanel, { display: colorDisplay, field: color })));
});
export default POIRenderer;
//# sourceMappingURL=POIRenderer.js.map