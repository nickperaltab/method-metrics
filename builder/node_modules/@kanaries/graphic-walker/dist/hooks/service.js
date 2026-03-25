import { useState, useEffect, useRef } from 'react';
import { feature } from 'topojson-client';
const GeoJSONDict = {};
export function useGeoJSON(geojson, url) {
    const key = url ? `${url.type}(${url.url})` : '';
    const data = (geojson || GeoJSONDict[key] || url);
    const [_, setLastFetched] = useState(0);
    const lastFetchedRef = useRef(0);
    useEffect(() => {
        if (data === url && url) {
            const timestamp = Date.now();
            lastFetchedRef.current = timestamp;
            fetch(url.url)
                .then((res) => res.json())
                .then((json) => {
                if (timestamp !== lastFetchedRef.current)
                    return;
                if (url.type === 'GeoJSON') {
                    if ('features' in json) {
                        GeoJSONDict[key] = json;
                    }
                    else {
                        throw 'invalid geojson';
                    }
                }
                else {
                    GeoJSONDict[key] = feature(json, Object.keys(json.objects)[0]);
                }
                setLastFetched(timestamp);
            })
                .catch((e) => console.error(e));
        }
    }, [data]);
    return data === url ? undefined : data;
}
//# sourceMappingURL=service.js.map