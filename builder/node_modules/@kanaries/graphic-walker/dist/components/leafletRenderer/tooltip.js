import React, { memo, useMemo } from "react";
import { useDisplayValueFormatter } from "./utils";
export const TooltipContent = memo(function TooltipContent({ allFields, vegaConfig, field, value }) {
    const { fid, analyticType, aggName } = field;
    const fieldDisplayLabel = useMemo(() => {
        const name = allFields.find(f => f.fid === fid)?.name ?? fid;
        return analyticType === 'measure' && aggName ? `${aggName}(${name})` : name;
    }, [allFields, fid, analyticType, aggName]);
    const formatter = useDisplayValueFormatter(field.semanticType, vegaConfig);
    return (React.createElement("p", null,
        fieldDisplayLabel,
        ": ",
        formatter(value)));
});
//# sourceMappingURL=tooltip.js.map