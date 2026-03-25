import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Slider as RangeSlider } from "../../components/rangeslider";
import { Input } from "../../components/ui/input";
const SliderContainer = styled.div `
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: stretch;
    padding-block: 1em;

    > .output {
        display: flex;
        justify-content: space-between;
        margin-top: 1em;

        > output {
            width: 100%;
        }

        > output:first-child {
            margin-right: 0.5em;
        }

        > output:last-child {
            margin-left: 0.5em;
        }
    }
`;
const ValueInput = (props) => {
    const { min, max, value, step, resetValue, onChange } = props;
    const [innerValue, setInnerValue] = useState(`${value ?? resetValue}`);
    const handleSubmitValue = () => {
        const v = Number(innerValue);
        if (!isNaN(v) && v <= max && v >= min) {
            onChange(v);
        }
        else {
            onChange(resetValue);
            setInnerValue(`${resetValue}`);
        }
    };
    useEffect(() => {
        setInnerValue(`${value ?? resetValue}`);
    }, [value]);
    return (React.createElement(Input, { type: "number", min: min, max: max, step: step, value: innerValue, onChange: (e) => setInnerValue(e.target.value), onBlur: handleSubmitValue, onKeyDown: (e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                handleSubmitValue();
            }
        } }));
};
const Slider = React.memo(function Slider({ min, max, value, onChange }) {
    const { t } = useTranslation();
    // step to last digit, e.g. 0.7 => 0.1
    const stepDigit = 10 ** Math.floor(Math.log10((max - min) / 100));
    return (React.createElement(SliderContainer, null,
        React.createElement(RangeSlider, { value: [value[0] ?? min, value[1] ?? max], min: min, max: max, step: stepDigit, onValueChange: ([min, max]) => onChange([min, max]) }),
        React.createElement("div", { className: "output" },
            React.createElement("output", { htmlFor: "slider:min" },
                React.createElement("div", { className: "my-1" }, t('filters.range.start_value')),
                React.createElement(ValueInput, { min: min, max: value[1] ?? max, value: value[0] ?? min, step: stepDigit, resetValue: min, onChange: (newValue) => onChange([newValue, value[1] ?? max]) })),
            React.createElement("output", { htmlFor: "slider:max" },
                React.createElement("div", { className: "my-1" }, t('filters.range.end_value')),
                React.createElement(ValueInput, { min: value[0] ?? min, max: max, value: value[1] ?? max, step: stepDigit, resetValue: max, onChange: (newValue) => onChange([value[0] ?? min, newValue]) })))));
});
export default Slider;
//# sourceMappingURL=slider.js.map