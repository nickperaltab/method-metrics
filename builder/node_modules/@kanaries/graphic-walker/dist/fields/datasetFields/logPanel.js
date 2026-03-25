import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVizStore } from '../../store';
import { Dialog, DialogContent, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
const FieldScalePanel = (props) => {
    const vizStore = useVizStore();
    const { showLogSettingPanel } = vizStore;
    const [baseNum, setBaseNum] = useState('');
    const { t } = useTranslation();
    useEffect(() => {
        setBaseNum('');
    }, [showLogSettingPanel]);
    return (React.createElement(Dialog, { open: showLogSettingPanel, onOpenChange: () => {
            vizStore.setShowLogSettingPanel(false);
        } },
        React.createElement(DialogContent, { className: "!w-fit" },
            React.createElement("div", { className: "flex flex-col justify-center items-start text-xs " },
                React.createElement("h2", { className: "text-lg font-medium mb-2" }, t(`calc.log_panel_title`)),
                React.createElement("p", { className: "font-normal text-muted-foreground" }, t(`calc.log_panel_desc`)),
                React.createElement("fieldset", { className: "mt-2 gap-1 flex flex-col justify-center items-start" },
                    React.createElement("div", { className: "flex items-center space-x-2" },
                        React.createElement("label", { className: "text-ml whitespace-nowrap" }, t(`calc.log_panel_number`)),
                        React.createElement(Input, { type: "text", value: baseNum, onChange: (e) => {
                                setBaseNum(e.target.value);
                            } })))),
            React.createElement(DialogFooter, { className: "mt-2" },
                React.createElement(Button, { children: t('actions.confirm'), onClick: () => {
                        const field = vizStore.createField;
                        vizStore.createLogField(field.channel, field.index, 'log', Number(baseNum));
                        vizStore.setShowLogSettingPanel(false);
                    } }),
                React.createElement(Button, { variant: "outline", children: t('actions.cancel'), onClick: () => {
                        vizStore.setShowLogSettingPanel(false);
                    } })))));
};
export default observer(FieldScalePanel);
//# sourceMappingURL=logPanel.js.map