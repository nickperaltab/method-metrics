import { observer } from 'mobx-react-lite';
import { CalendarInput, useFieldStats, useVisualCount } from './tabs';
import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useCompututaion } from '../../store';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Popover, Transition } from '@headlessui/react';
import { _unstable_encodeRuleValue, classNames, formatDate } from '../../utils';
import { parsedOffsetDate } from '../../lib/op/offset';
import LoadingLayer from '../../components/loadingLayer';
import { ArrowRightIcon, CheckIcon, ChevronUpDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { getTemporalRange, withComputedField } from '../../computation';
import { Slider } from '../../components/rangeslider';
import { createStreamedValueHook, useDebounceValueBind } from '../../hooks';
import { GLOBAL_CONFIG } from '../../config';
import { debounce } from 'lodash-es';
import { Input } from "../../components/ui/input";
const sortConfig = {
    key: 'value',
    ascending: true,
};
export const SimpleSearcher = observer(function SimpleSearcher({ field, onChange }) {
    if (field.rule?.type !== 'regexp')
        return null;
    const { value, caseSensitive } = field.rule;
    return (React.createElement("div", { className: "flex flex-col space-y-2 p-2" },
        React.createElement("label", { className: "text-sm leading-none font-medium" }, field.name),
        React.createElement("div", { className: "relative" },
            React.createElement(Input, { type: "search", className: "pr-8", value: value, placeholder: "Input Regular Expression...", onChange: (e) => {
                    onChange({
                        type: 'regexp',
                        value: e.target.value,
                        caseSensitive: !!caseSensitive,
                    });
                } }),
            React.createElement("div", { className: "absolute flex space-x-1 items-center inset-y-0 right-2" },
                React.createElement(Toggle, { label: "Match Case", value: !!caseSensitive, onChange: (v) => {
                        onChange({
                            type: 'regexp',
                            value: value,
                            caseSensitive: v,
                        });
                    } },
                    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 16 16" },
                        React.createElement("path", { fill: "currentColor", d: "M8.854 11.702h-1l-.816-2.159H3.772l-.768 2.16H2L4.954 4h.935zm-2.111-2.97L5.534 5.45a3.142 3.142 0 0 1-.118-.515h-.021c-.036.218-.077.39-.124.515L4.073 8.732zm7.013 2.97h-.88v-.86h-.022c-.383.66-.947.99-1.692.99c-.548 0-.978-.146-1.29-.436c-.307-.29-.461-.675-.461-1.155c0-1.027.605-1.625 1.815-1.794l1.65-.23c0-.935-.379-1.403-1.134-1.403c-.663 0-1.26.226-1.794.677V6.59c.54-.344 1.164-.516 1.87-.516c1.292 0 1.938.684 1.938 2.052zm-.88-2.782l-1.327.183c-.409.057-.717.159-.924.306c-.208.143-.312.399-.312.768c0 .268.095.489.285.66c.193.169.45.253.768.253a1.41 1.41 0 0 0 1.08-.457c.286-.308.43-.696.43-1.165z" })))))));
});
function Toggle(props) {
    return (React.createElement("div", { title: props.label, onClick: () => {
            props.onChange?.(!props.value);
        }, className: classNames(props.value ? 'bg-gray-100 dark:bg-zinc-700' : 'hover:bg-gray-100 dark:hover:bg-zinc-700', 'rounded cursor-pointer p-1 w-6 h-6 flex items-center justify-center') }, props.children));
}
export const SimpleOneOfSelector = observer(function SimpleOneOfSelector({ field, onChange, allFields, displayOffset }) {
    const computation = useCompututaion();
    const [keywordValue, setKeyword] = useState('');
    const [isCaseSenstive, setIsCaseSenstive] = useState(false);
    const [isWord, setIsWord] = useState(false);
    const [isRegexp, setIsRegexp] = useState(false);
    const keyword = useMemo(() => keywordValue
        ? {
            value: keywordValue,
            caseSenstive: isCaseSenstive,
            word: isWord,
            regexp: isRegexp,
        }
        : undefined, [keywordValue, isCaseSenstive, isWord, isRegexp]);
    const debouncer = useMemo(() => {
        const { timeout, ...options } = GLOBAL_CONFIG.KEYWORD_DEBOUNCE_SETTING;
        return function (f) {
            return debounce(f, timeout, options);
        };
    }, []);
    const debouncedKeyword = createStreamedValueHook(debouncer)(keyword);
    const enableKeyword = field.semanticType === 'nominal';
    const searchKeyword = enableKeyword ? debouncedKeyword : undefined;
    const { data, currentRows, handleSelect, loadData, loading } = useVisualCount(field, `${sortConfig.key}${sortConfig.ascending ? '' : '_dsc'}`, computation, onChange, allFields, {
        displayOffset,
        keyword: searchKeyword,
    });
    if (field.rule?.type !== 'one of' && field.rule?.type !== 'not in')
        return null;
    return (React.createElement("div", { className: "flex flex-col space-y-2 p-2 relative" },
        React.createElement("label", { className: "text-sm leading-none font-medium" }, field.name),
        React.createElement(Popover, { className: "w-full" },
            React.createElement(Popover.Button, { className: "flex shadow-sm items-center h-9 space-x-2 px-4 py-2 rounded-md border w-full text-left text-sm outline-none hover:bg-accent transition-colors bg-popover" },
                field.rule.value.length > 0 && (React.createElement("div", { className: "flex flex-1 space-x-2 min-w-[0px]" },
                    React.createElement("div", { className: "overflow-hidden text-ellipsis whitespace-nowrap" },
                        field.rule.type === 'not in' ? 'exclude: ' : '',
                        Array.from(field.rule.value).slice(0, 3).join(', ')),
                    field.rule.value.length > 3 && React.createElement("div", { className: "flex-shrink-0" },
                        "+",
                        field.rule.value.length - 3))),
                field.rule.value.length === 0 && (React.createElement("div", { className: "flex-1 text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap" }, field.rule.type === 'one of' ? 'Select Values...' : 'Select Values to Exclude...')),
                React.createElement("span", null,
                    React.createElement(ChevronUpDownIcon, { className: "h-4 w-4 text-gray-400", "aria-hidden": "true" }))),
            React.createElement(Transition, { as: Fragment, enter: "transition ease-out duration-200", enterFrom: "opacity-0 translate-y-1", enterTo: "opacity-100 translate-y-0", leave: "transition ease-in duration-150", leaveFrom: "opacity-100 translate-y-0", leaveTo: "opacity-0 translate-y-1" },
                React.createElement(Popover.Panel, { className: "absolute mt-2 z-10 border rounded-md inset-x-2 bg-popover shadow-md" },
                    React.createElement("div", { className: "flex flex-col w-full" },
                        enableKeyword && (React.createElement("div", { className: "relative border-b p-3 flex space-x-2 items-center text-sm" },
                            React.createElement(MagnifyingGlassIcon, { className: "w-4 h-4" }),
                            React.createElement("input", { type: "search", autoFocus: true, className: "block focus:ring-0 focus:outline-none py-0 pl-0  w-full border-0 shadow-none bg-transparent text-gray-700 text-sm h-4 dark:text-gray-200 placeholder:text-gray-400", value: keywordValue, placeholder: "Search Value...", onChange: (e) => {
                                    setKeyword(e.target.value);
                                } }),
                            React.createElement("div", { className: "absolute flex space-x-1 items-center inset-y-0 right-3" },
                                React.createElement(Toggle, { label: "Match Case", value: isCaseSenstive, onChange: setIsCaseSenstive },
                                    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 16 16" },
                                        React.createElement("path", { fill: "currentColor", d: "M8.854 11.702h-1l-.816-2.159H3.772l-.768 2.16H2L4.954 4h.935zm-2.111-2.97L5.534 5.45a3.142 3.142 0 0 1-.118-.515h-.021c-.036.218-.077.39-.124.515L4.073 8.732zm7.013 2.97h-.88v-.86h-.022c-.383.66-.947.99-1.692.99c-.548 0-.978-.146-1.29-.436c-.307-.29-.461-.675-.461-1.155c0-1.027.605-1.625 1.815-1.794l1.65-.23c0-.935-.379-1.403-1.134-1.403c-.663 0-1.26.226-1.794.677V6.59c.54-.344 1.164-.516 1.87-.516c1.292 0 1.938.684 1.938 2.052zm-.88-2.782l-1.327.183c-.409.057-.717.159-.924.306c-.208.143-.312.399-.312.768c0 .268.095.489.285.66c.193.169.45.253.768.253a1.41 1.41 0 0 0 1.08-.457c.286-.308.43-.696.43-1.165z" }))),
                                React.createElement(Toggle, { label: "Match Whole Word", value: isWord, onChange: setIsWord },
                                    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 16 16" },
                                        React.createElement("g", { fill: "currentColor" },
                                            React.createElement("path", { fillRule: "evenodd", d: "M0 11h1v2h14v-2h1v3H0z", clipRule: "evenodd" }),
                                            React.createElement("path", { d: "M6.84 11h-.88v-.86h-.022c-.383.66-.947.989-1.692.989c-.548 0-.977-.145-1.289-.435c-.308-.29-.462-.675-.462-1.155c0-1.028.605-1.626 1.816-1.794l1.649-.23c0-.935-.378-1.403-1.134-1.403c-.662 0-1.26.226-1.794.677v-.902c.541-.344 1.164-.516 1.87-.516c1.292 0 1.938.684 1.938 2.052zm-.88-2.782L4.633 8.4c-.408.058-.716.16-.924.307c-.208.143-.311.399-.311.768c0 .268.095.488.284.66c.194.168.45.253.768.253a1.41 1.41 0 0 0 1.08-.457c.286-.308.43-.696.43-1.165zm3.388 1.987h-.022V11h-.88V2.857h.88v3.61h.021c.434-.73 1.068-1.096 1.902-1.096c.705 0 1.257.247 1.654.741c.401.49.602 1.15.602 1.977c0 .92-.224 1.658-.672 2.213c-.447.551-1.06.827-1.837.827c-.726 0-1.276-.308-1.649-.924m-.022-2.218v.768c0 .455.147.841.44 1.16c.298.315.674.473 1.128.473c.534 0 .951-.204 1.252-.613c.304-.408.456-.975.456-1.702c0-.613-.141-1.092-.424-1.44c-.283-.347-.666-.52-1.15-.52c-.511 0-.923.178-1.235.536c-.311.355-.467.8-.467 1.338" })))),
                                React.createElement(Toggle, { label: "Use Regular Expression", value: isRegexp, onChange: setIsRegexp },
                                    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 16 16" },
                                        React.createElement("path", { fill: "currentColor", fillRule: "evenodd", d: "M10.012 2h.976v3.113l2.56-1.557l.486.885L11.47 6l2.564 1.559l-.485.885l-2.561-1.557V10h-.976V6.887l-2.56 1.557l-.486-.885L9.53 6L6.966 4.441l.485-.885l2.561 1.557zM2 10h4v4H2z", clipRule: "evenodd" })))))),
                        loading && (React.createElement("div", { className: "h-24 w-full relative" },
                            React.createElement(LoadingLayer, null))),
                        !loading && (React.createElement(VirtualList, { field: field, data: data, distinctTotal: currentRows, handleSelect: handleSelect, loadData: loadData, displayOffset: displayOffset }))))))));
});
const tableRow = 'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none space-x-2 hover:bg-gray-100 dark:hover:bg-gray-800';
function VirtualList({ field, distinctTotal, data, handleSelect, loadData, displayOffset, }) {
    const parentRef = useRef(null);
    const rowVirtualizer = useVirtualizer({
        count: distinctTotal ?? 0,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 32,
        overscan: 10,
    });
    const ruleSet = useMemo(() => field.rule && (field.rule.type === 'not in' || field.rule?.type === 'one of')
        ? new Set(field.rule.value.map((x) => _unstable_encodeRuleValue(x)))
        : null, [field]);
    return (React.createElement("div", { className: "overflow-y-auto w-full flex flex-col max-h-64 p-1", ref: parentRef },
        React.createElement("div", { style: {
                paddingBottom: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
            } }, rowVirtualizer.getVirtualItems().map((vItem) => {
            const idx = vItem.index;
            const item = data?.get(idx);
            if (!item) {
                return (React.createElement("div", { key: idx, className: classNames('animate-pulse', tableRow), style: {
                        height: `${vItem.size}px`,
                        transform: `translateY(${vItem.start}px)`,
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                    } },
                    React.createElement("div", { className: "h-4 w-4" }),
                    React.createElement("div", { className: "flex justify-left items-center" },
                        React.createElement("div", { className: "h-3 w-20 bg-slate-200 rounded" })),
                    React.createElement(Effecter, { effect: () => loadData(idx), effectId: `${field.fid}_${sortConfig.key}${sortConfig.ascending ? '' : '_dsc'}_${idx}` })));
            }
            const { value, count } = item;
            const checked = (!!ruleSet && field.rule?.type === 'one of' && ruleSet.has(_unstable_encodeRuleValue(value))) ||
                (!!ruleSet && field.rule?.type === 'not in' && !ruleSet.has(_unstable_encodeRuleValue(value)));
            const displayValue = field.semanticType === 'temporal' ? formatDate(parsedOffsetDate(displayOffset, field.offset)(value)) : `${value}`;
            return (React.createElement("div", { key: idx, className: tableRow, style: {
                    height: `${vItem.size}px`,
                    transform: `translateY(${vItem.start}px)`,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                }, onClick: () => handleSelect(value, !checked, count) },
                React.createElement(CheckIcon, { className: classNames('w-4 h-4', checked ? 'opacity-100' : 'opacity-0') }),
                React.createElement("div", { className: "whitespace-nowrap text-ellipsis overflow-hidden min-w-0 flex-1" }, displayValue)));
        })),
        distinctTotal === 0 && React.createElement("div", { className: "py-6 text-center" }, "No value found.")));
}
const Effecter = (props) => {
    useEffect(() => {
        props.effect();
    }, [props.effectId]);
    return null;
};
export const SimpleTemporalRange = ({ field, allFields, onChange, displayOffset }) => {
    const computationFunction = useCompututaion();
    const [res, setRes] = useState(() => [0, 0, '', false]);
    React.useEffect(() => {
        withComputedField(field, allFields, computationFunction, { timezoneDisplayOffset: displayOffset })((service) => getTemporalRange(service, field.fid, field.offset)).then(([min, max, format]) => setRes([min, max, format, true]));
    }, [field.fid]);
    const [min, max, format, loaded] = res;
    const offset = field.offset ?? new Date().getTimezoneOffset();
    const handleChange = React.useCallback((value) => {
        onChange({
            type: 'temporal range',
            value,
            format,
            offset,
        });
    }, [format, offset]);
    if (field.rule?.type !== 'temporal range')
        return null;
    if (!loaded) {
        return (React.createElement("div", { className: "flex flex-col space-y-2 p-2" },
            React.createElement("label", { className: "text-sm leading-none font-medium" }, field.name),
            React.createElement("div", { className: "h-9 w-full relative" },
                React.createElement(LoadingLayer, null))));
    }
    return (React.createElement("div", { className: "flex flex-col space-y-2 p-2" },
        React.createElement("label", { className: "text-sm leading-none font-medium" }, field.name),
        React.createElement("div", { className: "flex space-x-2 items-center h-9" },
            React.createElement("div", { className: "flex-1" },
                React.createElement(CalendarInput, { className: "h-9 py-4", displayOffset: displayOffset, min: min, max: field.rule.value[1] ?? max, value: field.rule.value[0] ?? min, onChange: (value) => handleChange([value, field.rule?.value[1]]) })),
            React.createElement("div", { className: "flex-shrink-0" },
                React.createElement(ArrowRightIcon, { className: "w-4 h-4" })),
            React.createElement("div", { className: "flex-1" },
                React.createElement(CalendarInput, { className: "h-9 py-4", displayOffset: displayOffset, min: field.rule.value[0] ?? min, max: max, value: field.rule.value[1] ?? max, onChange: (value) => handleChange([field.rule?.value[0], value]) })))));
};
export const SimpleRange = ({ field, onChange, allFields, displayOffset }) => {
    const computation = useCompututaion();
    const [stats] = useFieldStats(field, { values: false, range: true, valuesMeta: false, displayOffset }, 'none', computation, allFields);
    const range = stats?.range;
    const handleChange = React.useCallback((value) => {
        onChange({
            type: 'range',
            value,
        });
    }, []);
    if (field.rule?.type !== 'range')
        return null;
    if (!range) {
        return (React.createElement("div", { className: "flex flex-col space-y-2 p-2" },
            React.createElement("label", { className: "text-sm leading-none font-medium" }, field.name),
            React.createElement("div", { className: "h-9 w-full relative" },
                React.createElement(LoadingLayer, null))));
    }
    return React.createElement(RangeField, { name: field.name, value: field.rule.value, range: range, onChange: handleChange });
};
function RangeField({ name, value, range, onChange, }) {
    const [innerValue, setInnerValue] = useDebounceValueBind(value, onChange);
    // step to last digit
    const stepDigit = 10 ** Math.floor(Math.log10((range[1] - range[0]) / 100));
    return (React.createElement("div", { className: "flex flex-col space-y-2 p-2" },
        React.createElement("div", { className: "flex justify-between text-sm leading-none" },
            React.createElement("label", { className: "font-medium" }, name),
            React.createElement("span", { className: "text-right text-gray-500" },
                "[",
                innerValue[0],
                ",",
                innerValue[1],
                "]")),
        React.createElement("div", { className: "flex items-center h-9" },
            React.createElement(Slider, { step: stepDigit, min: range[0], max: range[1], value: [innerValue[0] ?? range[0], innerValue[1] ?? range[1]], onValueChange: ([min, max]) => setInnerValue([min, max]) }))));
}
//# sourceMappingURL=simple.js.map