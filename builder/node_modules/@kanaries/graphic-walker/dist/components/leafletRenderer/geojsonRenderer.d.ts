import React from 'react';
import { IGeoUrl } from '../../interfaces';
export declare function GeojsonRenderer(props: {
    url?: IGeoUrl;
    data?: string;
    type?: 'GeoJSON' | 'TopoJSON';
}): React.JSX.Element | null;
