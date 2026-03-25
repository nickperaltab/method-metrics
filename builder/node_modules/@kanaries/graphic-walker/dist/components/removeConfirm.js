import React from 'react';
import { observer } from 'mobx-react-lite';
import { useVizStore } from '../store';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogFooter, DialogHeader } from './ui/dialog';
import { Button } from './ui/button';
const RemoveConfirm = observer(function RemoveConfirm() {
    const { t } = useTranslation();
    const viz = useVizStore();
    return (React.createElement(Dialog, { onOpenChange: () => viz.closeRemoveConfirmModal(), open: viz.removeConfirmIdx !== null },
        React.createElement(DialogContent, null,
            React.createElement(DialogHeader, null, t('main.tablist.remove_confirm')),
            React.createElement(DialogFooter, { className: "mt-4" },
                React.createElement(Button, { variant: "outline", onClick: () => {
                        viz.closeRemoveConfirmModal();
                    } }, t('actions.cancel')),
                React.createElement(Button, { variant: "destructive", onClick: () => {
                        viz.removeVisualization(viz.removeConfirmIdx);
                        viz.closeRemoveConfirmModal();
                    } }, t('actions.confirm'))))));
});
export default RemoveConfirm;
//# sourceMappingURL=removeConfirm.js.map