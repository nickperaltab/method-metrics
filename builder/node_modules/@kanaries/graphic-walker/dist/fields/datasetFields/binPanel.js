import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { useVizStore } from '../../store';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Input } from "../../components/ui/input";
const FieldScalePanel = (props) => {
    const vizStore = useVizStore();
    const { showBinSettingPanel, setShowBinSettingPanel } = vizStore;
    const { t } = useTranslation();
    const [chosenOption, setChosenOption] = useState('widths');
    const [value, setValue] = useState('');
    const options = ['widths', 'counts'];
    useEffect(() => {
        setChosenOption('widths');
        setValue('');
    }, [showBinSettingPanel]);
    return (React.createElement(Dialog, { open: showBinSettingPanel, onOpenChange: () => {
            setShowBinSettingPanel(false);
        } },
        React.createElement(DialogContent, { className: "!w-fit" },
            React.createElement("div", { className: "flex flex-col justify-center items-start text-xs" },
                React.createElement("h2", { className: "text-lg font-medium mb-2" }, t('calc.bin_panel_title')),
                React.createElement("p", { className: "font-normal text-muted-foreground" }, t('calc.bin_panel_desc')),
                React.createElement(RadioGroup, { value: chosenOption, onValueChange: (opt) => setChosenOption(opt), className: "mt-2 gap-1 flex flex-col justify-center items-start" }, options.map((option, index) => {
                    return (React.createElement("div", { key: index },
                        React.createElement("div", { className: "flex my-1", key: option },
                            React.createElement("div", { className: "align-top" },
                                React.createElement(RadioGroupItem, { id: option, value: option })),
                            React.createElement("div", { className: "ml-3" },
                                React.createElement("label", { htmlFor: option }, t(`calc.bin_panel_option_${option}`)))),
                        chosenOption === option && (React.createElement("div", { className: "flex items-center space-x-2" },
                            React.createElement("label", { className: "text-ml whitespace-nowrap" }, t(`calc.bin_panel_number`)),
                            React.createElement(Input, { type: "text", value: value, onChange: (e) => {
                                    setValue(e.target.value);
                                } })))));
                }))),
            React.createElement(DialogFooter, { className: "mt-2" },
                React.createElement(Button, { children: t('actions.confirm'), onClick: () => {
                        const field = vizStore.createField;
                        vizStore.createBinField(field.channel, field.index, chosenOption === 'widths' ? 'bin' : 'binCount', Number(value));
                        vizStore.setShowBinSettingPanel(false);
                        return;
                    } }),
                React.createElement(Button, { variant: "outline", children: t('actions.cancel'), onClick: () => {
                        vizStore.setShowBinSettingPanel(false);
                        return;
                    } })))));
};
export default observer(FieldScalePanel);
//# sourceMappingURL=binPanel.js.map