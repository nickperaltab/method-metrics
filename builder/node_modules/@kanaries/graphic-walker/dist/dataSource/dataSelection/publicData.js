import React from 'react';
import Table from '../table';
import { DemoDataAssets, PUBLIC_DATA_LIST } from '../config';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { RadioGroup } from '@headlessui/react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { classNames } from '../../utils';
import { Button } from "../../components/ui/button";
const PublicData = ({ commonStore }) => {
    const { tmpDataSource } = commonStore;
    const { t } = useTranslation('translation', { keyPrefix: 'DataSource.dialog.public' });
    const handleDataKeyChange = async (data) => {
        try {
            const response = await fetch(DemoDataAssets[data.key]);
            const res = await response.json();
            commonStore.updateTempSTDDS({
                dataSource: res.dataSource,
                rawFields: res.fields.map((f) => ({
                    fid: f.fid,
                    name: f.name,
                    analyticType: f.analyticType,
                    semanticType: f.semanticType,
                    dataType: f.dataType || '?',
                })),
                name: data.title,
            });
        }
        catch (error) {
            // TODO: add error notification.
            console.error('Error fetching public data:', error);
        }
    };
    return (React.createElement("div", null,
        React.createElement(RadioGroup, { className: "h-48 overflow-auto mb-1", by: "key", onChange: handleDataKeyChange }, PUBLIC_DATA_LIST.map((data) => (React.createElement(RadioGroup.Option, { key: data.key, value: data, className: ({ active, checked }) => classNames('flex focus:outline-none border ring-ring rounded items-center justify-between p-2 m-2 cursor-pointer hover:bg-accent hover:text-accent-foreground', active ? 'ring-2 ring-offset-2' : '', checked ? 'bg-muted text-muted-foreground' : '') }, ({ checked }) => (React.createElement(React.Fragment, null,
            React.createElement(RadioGroup.Label, { as: "p" }, data.title),
            checked && (React.createElement("div", { className: "shrink-0 text-primary" },
                React.createElement(CheckCircleIcon, { className: "w-5 h-5" }))))))))),
        React.createElement(Button, { className: "my-1", disabled: tmpDataSource.length === 0, onClick: () => {
                commonStore.commitTempDS();
            } }, t('submit')),
        React.createElement(Table, { commonStore: commonStore })));
};
export default observer(PublicData);
//# sourceMappingURL=publicData.js.map