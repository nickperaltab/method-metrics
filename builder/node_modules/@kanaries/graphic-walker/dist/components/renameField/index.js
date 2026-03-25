import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { useVizStore } from '../../store';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
const RenamePanel = (props) => {
    const vizStore = useVizStore();
    const { showRenamePanel, createField, currentEncodings } = vizStore;
    const { t } = useTranslation();
    const [value, setValue] = useState('');
    useEffect(() => {
        if (createField) {
            setValue(currentEncodings[createField.channel]?.[createField.index]?.name ?? '');
        }
    }, [showRenamePanel]);
    return (React.createElement(Dialog, { open: showRenamePanel, onOpenChange: () => vizStore.setShowRenamePanel(false) },
        React.createElement(DialogContent, { className: "!w-fit" },
            React.createElement("div", { className: "flex flex-col justify-center items-start text-xs" },
                React.createElement("h2", { className: "text-lg font-medium mb-2" }, "Rename Field"),
                React.createElement("p", { className: "font-normal text-muted-foreground" }, "This action will rename this field's name in the chart."),
                React.createElement("div", { className: "flex items-center space-x-2 mt-2" },
                    React.createElement("label", { className: "text-ml whitespace-nowrap" }, "New Name"),
                    React.createElement(Input, { type: "text", value: value, onChange: (e) => {
                            setValue(e.target.value);
                        } }))),
            React.createElement(DialogFooter, { className: "mt-2" },
                React.createElement(Button, { children: t('actions.confirm'), onClick: () => {
                        const field = vizStore.createField;
                        vizStore.renameFieldInChart(field.channel, field.index, value);
                        vizStore.setShowRenamePanel(false);
                        return;
                    } }),
                React.createElement(Button, { variant: "outline", children: t('actions.cancel'), onClick: () => {
                        vizStore.setShowRenamePanel(false);
                        return;
                    } })))));
};
export default observer(RenamePanel);
//# sourceMappingURL=index.js.map