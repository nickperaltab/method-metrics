import React from 'react';
import { DocumentTextIcon, HashtagIcon, CalendarIcon } from '@heroicons/react/24/outline';
const DataTypeIcon = (props) => {
    const { dataType, analyticType } = props;
    const color = analyticType === 'dimension' ? 'text-dimension' : 'text-measure';
    const iconClassName = `w-3 inline-block ${color}`;
    switch (dataType) {
        case 'quantitative':
        case 'ordinal':
            return React.createElement(HashtagIcon, { className: iconClassName });
        case 'temporal':
            return React.createElement(CalendarIcon, { className: iconClassName });
        default:
            return React.createElement(DocumentTextIcon, { className: iconClassName });
    }
};
export default DataTypeIcon;
//# sourceMappingURL=dataTypeIcon.js.map