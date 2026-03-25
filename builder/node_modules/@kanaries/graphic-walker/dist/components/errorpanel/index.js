import { observer } from 'mobx-react-lite';
import { useVizStore } from '../../store';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Dialog, DialogContent } from '../ui/dialog';
export default observer(function ErrorPanel() {
    const vizStore = useVizStore();
    const { t } = useTranslation();
    const closeModal = () => {
        vizStore.updateShowErrorResolutionPanel(0);
        return;
    };
    switch (vizStore.showErrorResolutionPanel) {
        case 0:
            return null;
        case 500:
            return (React.createElement(Dialog, { open: true, onOpenChange: closeModal },
                React.createElement(DialogContent, { className: "!w-fit" },
                    React.createElement("div", { className: "flex flex-col justify-center items-start" },
                        React.createElement("h2", { className: "font-medium text-xl my-2" }, "Oops!"),
                        React.createElement("p", { className: "font-normal my-2" }, "The chart is too large to render. You can try options above:"),
                        React.createElement("p", { className: "font-normal my-2" },
                            "1. Set the chart to a fixed size.",
                            React.createElement("a", { className: "mx-2 cursor-pointer font-semibold text-primary", onClick: () => {
                                    vizStore.setVisualLayout('size', { mode: 'fixed', width: 800, height: 600 });
                                    closeModal();
                                } }, "Set Now")),
                        React.createElement("p", { className: "font-normal my-2" },
                            "2. Change to SVG renderer.",
                            React.createElement("a", { className: "mx-2 cursor-pointer font-semibold text-primary", onClick: () => {
                                    vizStore.setVisualLayout('useSvg', true);
                                    closeModal();
                                } }, "Set Now")),
                        React.createElement("p", { className: "font-normal my-2" }, "3. Close this modal and edit the chart to reduce chart size."),
                        React.createElement("fieldset", { className: "mt-2 gap-1 flex flex-col justify-center items-end w-full" },
                            React.createElement("div", { className: "mt-2" },
                                React.createElement(Button, { variant: "outline", children: `Close`, className: "mr-2", onClick: closeModal })))))));
        case 501:
            return (React.createElement(Dialog, { open: true, onOpenChange: closeModal },
                React.createElement(DialogContent, null,
                    React.createElement("div", { className: "flex flex-col justify-center items-start" },
                        React.createElement("h2", { className: "font-medium text-xl my-2" }, "Oops!"),
                        React.createElement("p", { className: "font-normal my-2" }, "There is some error with Computation service. Here is the Error message:"),
                        React.createElement("p", { className: "font-normal my-2" }, vizStore.lastErrorMessage),
                        React.createElement("fieldset", { className: "mt-2 gap-1 flex flex-col justify-center items-end w-full" },
                            React.createElement("div", { className: "mt-2" },
                                React.createElement(Button, { variant: "outline", children: `Close`, className: "mr-2", onClick: closeModal })))))));
        case 502:
            return (React.createElement(Dialog, { open: true, onOpenChange: closeModal },
                React.createElement(DialogContent, null,
                    React.createElement("div", { className: "flex flex-col justify-center items-start" },
                        React.createElement("h2", { className: "font-medium text-xl my-2" }, "Oops!"),
                        React.createElement("p", { className: "font-normal my-2" }, "There is some error with Askviz service. Here is the Error message:"),
                        React.createElement("p", { className: "font-normal my-2" }, vizStore.lastErrorMessage),
                        React.createElement("fieldset", { className: "mt-2 gap-1 flex flex-col justify-center items-end w-full" },
                            React.createElement("div", { className: "mt-2" },
                                React.createElement(Button, { variant: "outline", children: `Close`, className: "mr-2", onClick: closeModal })))))));
    }
    return null;
});
//# sourceMappingURL=index.js.map