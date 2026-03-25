import { IGeoUrl } from '../interfaces';
import type { FeatureCollection } from 'geojson';
export declare function useGeoJSON(geojson?: FeatureCollection, url?: IGeoUrl): FeatureCollection<import("geojson").Geometry, import("geojson").GeoJsonProperties> | undefined;
