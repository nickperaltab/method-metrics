import React from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '../../components/rangeslider';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { NumberInput } from '../ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
export function RangeScale(props) {
    const { t } = useTranslation();
    return (React.createElement("div", { className: "flex md:flex-row flex-col gap-6 my-2" },
        React.createElement("div", { className: "flex flex-col space-y-2 items-start" },
            React.createElement("div", { className: "flex items-center space-x-2" },
                React.createElement(Checkbox, { id: `type_${props.text}`, checked: props.enableType, onCheckedChange: props.setEnableType }),
                React.createElement(Label, { htmlFor: `type_${props.text}` }, t('config.type'))),
            React.createElement(Select, { value: props.type, disabled: !props.enableType, onValueChange: props.setType },
                React.createElement(SelectTrigger, null,
                    React.createElement(SelectValue, null)),
                React.createElement(SelectContent, null,
                    React.createElement(SelectItem, { value: "linear" }, "Linear"),
                    React.createElement(SelectItem, { value: "log" }, "Log"),
                    React.createElement(SelectItem, { value: "pow" }, "Pow"),
                    React.createElement(SelectItem, { value: "sqrt" }, "Sqrt"),
                    React.createElement(SelectItem, { value: "symlog" }, "Symlog")))),
        React.createElement("div", { className: "flex flex-col space-y-2 items-start" },
            React.createElement("div", { className: "flex items-center space-x-2" },
                React.createElement(Checkbox, { id: `min_domain_${props.text}`, checked: props.enableMinDomain, onCheckedChange: props.setEnableMinDomain }),
                React.createElement(Label, { htmlFor: `min_domain_${props.text}` }, t('config.min_domain'))),
            React.createElement(NumberInput, { className: "w-32", value: props.domainMin, onChange: (e) => {
                    const v = Number(e.target.value);
                    if (!isNaN(v)) {
                        props.setDomainMin(v);
                    }
                }, type: "number", disabled: !props.enableMinDomain })),
        React.createElement("div", { className: "flex flex-col space-y-2 items-start" },
            React.createElement("div", { className: "flex items-center space-x-2" },
                React.createElement(Checkbox, { id: `max_domain_${props.text}`, checked: props.enableMaxDomain, onCheckedChange: props.setEnableMaxDomain }),
                React.createElement(Label, { htmlFor: `max_domain_${props.text}` }, t('config.max_domain'))),
            React.createElement(NumberInput, { className: "w-32", value: props.domainMax, onChange: (e) => {
                    const v = Number(e.target.value);
                    if (!isNaN(v)) {
                        props.setDomainMax(v);
                    }
                }, type: "number", disabled: !props.enableMaxDomain })),
        React.createElement("div", { className: "flex flex-col items-start w-48 space-y-2" },
            React.createElement("div", { className: "flex items-center space-x-2" },
                React.createElement(Checkbox, { id: `range_${props.text}`, checked: props.enableRange, onCheckedChange: props.setEnableRange }),
                React.createElement(Label, { htmlFor: `range_${props.text}` }, t('config.range'))),
            React.createElement("div", { className: "flex w-full flex-col space-y-2 pt-2" },
                React.createElement(Slider, { disabled: !props.enableRange, max: props.maxRange, min: props.minRange, value: [props.rangeMin, props.rangeMax], onValueChange: ([min, max]) => {
                        props.setRangeMin(min);
                        props.setRangeMax(max);
                    }, step: props.maxRange < 2 ? 0.01 : 1 }),
                React.createElement("div", { className: "relative w-full h-4" },
                    React.createElement("div", { className: "text-xs absolute left-0 text-foreground inset-y-0" }, props.rangeMin),
                    React.createElement("div", { className: "text-xs absolute right-0 text-foreground inset-y-0" }, props.rangeMax))))));
}
export function DomainScale(props) {
    const { t } = useTranslation();
    return (React.createElement("div", { className: "flex md:flex-row flex-col gap-6 my-2" },
        React.createElement("div", { className: "flex flex-col space-y-2 items-start" },
            React.createElement("div", { className: "flex items-center space-x-2" },
                React.createElement(Checkbox, { id: `type_${props.text}`, checked: props.enableType, onCheckedChange: props.setEnableType }),
                React.createElement(Label, { htmlFor: `type_${props.text}` }, t('config.type'))),
            React.createElement(Select, { value: props.type, disabled: !props.enableType, onValueChange: props.setType },
                React.createElement(SelectTrigger, null,
                    React.createElement(SelectValue, null)),
                React.createElement(SelectContent, null,
                    React.createElement(SelectItem, { value: "linear" }, "Linear"),
                    React.createElement(SelectItem, { value: "log" }, "Log"),
                    React.createElement(SelectItem, { value: "pow" }, "Pow"),
                    React.createElement(SelectItem, { value: "sqrt" }, "Sqrt"),
                    React.createElement(SelectItem, { value: "symlog" }, "Symlog")))),
        React.createElement("div", { className: "flex flex-col space-y-2 items-start" },
            React.createElement("div", { className: "flex items-center space-x-2" },
                React.createElement(Checkbox, { id: `min_domain_${props.text}`, checked: props.enableMinDomain, onCheckedChange: props.setEnableMinDomain }),
                React.createElement(Label, { htmlFor: `min_domain_${props.text}` }, t('config.min_domain'))),
            React.createElement(NumberInput, { className: "w-32", value: props.domainMin, onChange: (e) => {
                    const v = Number(e.target.value);
                    if (!isNaN(v)) {
                        props.setDomainMin(v);
                    }
                }, type: "number", disabled: !props.enableMinDomain })),
        React.createElement("div", { className: "flex flex-col space-y-2 items-start" },
            React.createElement("div", { className: "flex items-center space-x-2" },
                React.createElement(Checkbox, { id: `max_domain_${props.text}`, checked: props.enableMaxDomain, onCheckedChange: props.setEnableMaxDomain }),
                React.createElement(Label, { htmlFor: `max_domain_${props.text}` }, t('config.max_domain'))),
            React.createElement(NumberInput, { className: "w-32", value: props.domainMax, onChange: (e) => {
                    const v = Number(e.target.value);
                    if (!isNaN(v)) {
                        props.setDomainMax(v);
                    }
                }, type: "number", disabled: !props.enableMaxDomain }))));
}
//# sourceMappingURL=range-scale.js.map