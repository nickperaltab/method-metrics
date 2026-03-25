import { ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounceValueBind } from '../hooks';
import { Slider } from './ui/slider';
export const ResizeDialog = (props) => {
    const { onWidthChange, onHeightChange, width, height, children } = props;
    const { t } = useTranslation('translation', { keyPrefix: 'main.tabpanel.settings.size_setting' });
    const [innerWidth, setInnerWidth] = useDebounceValueBind(width, onWidthChange);
    const [innerHeight, setInnerHeight] = useDebounceValueBind(height, onHeightChange);
    const sliderWidthValue = useMemo(() => [Math.sqrt(innerWidth / 1000)], [innerWidth]);
    const sliderHeightValue = useMemo(() => [Math.sqrt(innerHeight / 1000)], [innerHeight]);
    return (React.createElement("div", { className: "w-60 p-2" },
        children,
        React.createElement("div", { className: "mt-4" },
            React.createElement(Slider, { min: 0, max: 1, step: 0.01, name: "width", className: "w-full", onValueChange: ([v]) => setInnerWidth(Math.round(v ** 2 * 1000)), value: sliderWidthValue }),
            React.createElement("div", { className: "ml-1 mt-1 text-xs" }, `${t('width')}: ${innerWidth}`)),
        React.createElement("div", { className: "mt-4" },
            React.createElement(Slider, { min: 0, max: 1, step: 0.01, name: "height", className: "w-full", onValueChange: ([v]) => setInnerHeight(Math.round(v ** 2 * 1000)), value: sliderHeightValue }),
            React.createElement("div", { className: "ml-1 mt-1 text-xs" },
                " ",
                `${t('height')}: ${innerHeight}`))));
};
const SizeSetting = (props) => {
    const { onWidthChange, onHeightChange, width, height } = props;
    const [show, setShow] = useState(false);
    const { t } = useTranslation('translation', { keyPrefix: 'main.tabpanel.settings.size_setting' });
    useEffect(() => {
        if (show) {
            const closeDialog = () => {
                setShow(false);
            };
            let subscribed = false;
            const timer = setTimeout(() => {
                subscribed = true;
                document.body.addEventListener('click', closeDialog);
            }, 200);
            return () => {
                clearTimeout(timer);
                if (subscribed) {
                    document.body.removeEventListener('click', closeDialog);
                }
            };
        }
    }, [show]);
    return (React.createElement("div", { className: "leading-none cursor-pointer" },
        React.createElement(ArrowsPointingOutIcon, { role: "button", id: "button:size_setting", "aria-describedby": "button:size_setting:label", tabIndex: 0, "aria-haspopup": "dialog", onClick: () => {
                setShow((v) => !v);
            }, className: "w-4 h-4 inline-block mr-0.5 text-gray-900" }),
        show && (React.createElement(React.Fragment, null,
            React.createElement(ResizeDialog, { ...props },
                React.createElement("div", null,
                    React.createElement(XMarkIcon, { className: "text-gray-900 absolute right-2 top-2 w-4 cursor-pointer hover:bg-red-100", role: "button", tabIndex: 0, "aria-label": "close", onClick: (e) => {
                            setShow(false);
                            e.stopPropagation();
                        } })))))));
};
export default SizeSetting;
//# sourceMappingURL=sizeSetting.js.map