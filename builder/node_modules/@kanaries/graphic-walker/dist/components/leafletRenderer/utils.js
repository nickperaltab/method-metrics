import { useMemo } from "react";
import { timeFormat as tFormat } from "d3-time-format";
import { format } from "d3-format";
import { useMap } from "react-leaflet";
const defaultFormatter = (value) => `${value}`;
export const useDisplayValueFormatter = (semanticType, vegaConfig) => {
    const { timeFormat = "%b %d, %Y", numberFormat } = vegaConfig;
    const timeFormatter = useMemo(() => {
        const tf = tFormat(timeFormat);
        return (value) => {
            if (typeof value !== 'number' && typeof value !== 'string') {
                return '';
            }
            const date = new Date(value);
            if (isNaN(date.getTime())) {
                return 'Invalid Date';
            }
            return tf(date);
        };
    }, [timeFormat]);
    const numberFormatter = useMemo(() => {
        if (!numberFormat) {
            return (value) => {
                if (typeof value !== 'number') {
                    return '';
                }
                return value.toLocaleString();
            };
        }
        const nf = format(numberFormat);
        return (value) => {
            if (typeof value !== 'number') {
                return '';
            }
            return nf(value);
        };
    }, [numberFormat]);
    const formatter = useMemo(() => {
        if (semanticType === 'quantitative') {
            return numberFormatter;
        }
        else if (semanticType === 'temporal') {
            return timeFormatter;
        }
        else {
            return defaultFormatter;
        }
    }, [semanticType, numberFormatter, timeFormatter]);
    return formatter;
};
export function ChangeView({ bounds }) {
    const map = useMap();
    map.flyToBounds(bounds);
    return null;
}
//# sourceMappingURL=utils.js.map