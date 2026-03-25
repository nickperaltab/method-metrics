import React from 'react';
import CSVData from './csvData';
import PublicData from './publicData';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
const DataSelection = (props) => {
    const { commonStore } = props;
    const { t } = useTranslation('translation', { keyPrefix: 'DataSource' });
    return (React.createElement("div", { className: "text-sm" },
        React.createElement("div", { className: "mt-4" },
            React.createElement(Tabs, { defaultValue: "file" },
                React.createElement(TabsList, null,
                    React.createElement(TabsTrigger, { value: "file" }, t('dialog.text_file_data')),
                    React.createElement(TabsTrigger, { value: "public" }, t('dialog.public_data'))),
                React.createElement(TabsContent, { value: "file" },
                    React.createElement(CSVData, { commonStore: commonStore })),
                React.createElement(TabsContent, { value: "public" },
                    React.createElement(PublicData, { commonStore: commonStore }))))));
};
export default DataSelection;
//# sourceMappingURL=index.js.map