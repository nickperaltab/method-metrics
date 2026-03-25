import { useCompututaion, useVizStore } from "../../store";
import { observer } from 'mobx-react-lite';
import React, { useMemo, useState, useContext } from 'react';
import { Card, CardContent, CardTitle } from '../ui/card';
import { CpuChipIcon, TrashIcon, UserIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';
import SpecRenderer from "../../renderer/specRenderer";
import { vegaThemeContext } from "../../store/theme";
import { useRenderer } from "../../renderer/hooks";
import { getSort, parseErrorMessage } from "../../utils";
import { useReporter } from "../../utils/reportError";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Textarea } from '../ui/textarea';
import LoadingLayer from '../loadingLayer';
async function fetchQueryChat(api, metas, messages, headers) {
    const res = await fetch(api, {
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({
            metas,
            messages,
        }),
    });
    const result = await res.json();
    if (result.success) {
        return result.data;
    }
    else {
        throw new Error(result.message);
    }
}
async function queryChat(api, data, headers) {
    const chats = data.chats.concat({
        role: 'user',
        content: data.query,
        type: 'normal',
    });
    if (typeof api === 'string') {
        return fetchQueryChat(api, data.metas, chats, headers);
    }
    return api(data.metas, chats);
}
function UserMessage(props) {
    const collapasable = props.message.type === 'generated';
    return (React.createElement(Card, null,
        React.createElement("div", { className: "p-6 pb-2 flex space-x-2 items-center" },
            React.createElement("div", { className: "p-1 w-6 h-6 rounded-full bg-muted" },
                React.createElement(UserIcon, { className: "w-4 h-4" })),
            React.createElement(CardTitle, { className: "flex-1" }, "You"),
            props.onRemove && (React.createElement(Button, { variant: "ghost", size: "icon-sm", onClick: props.onRemove },
                React.createElement(TrashIcon, { className: "w-4 h-4" })))),
        React.createElement(CardContent, { className: "pl-14" },
            collapasable && (React.createElement(Collapsible, null,
                React.createElement(CollapsibleTrigger, { className: "text-muted-foreground" }, "Click to expand auto generated message"),
                React.createElement(CollapsibleContent, { className: "whitespace-pre" }, props.message.content))),
            !collapasable && props.message.content)));
}
const AssistantMessage = observer(function AssistantMessage(props) {
    const computation = useCompututaion();
    const { config, encodings, layout, name } = props.message.chart;
    const { vizThemeConfig } = useContext(vegaThemeContext);
    const sort = getSort(encodings);
    const { allFields, viewDimensions, viewMeasures, filters } = useMemo(() => {
        const viewDimensions = [];
        const viewMeasures = [];
        const { dimensions, measures, filters, ...state } = encodings;
        const allFields = [...dimensions, ...measures];
        const dKeys = Object.keys(state);
        for (const dKey of dKeys) {
            for (const f of state[dKey]) {
                if (f.analyticType === 'dimension') {
                    viewDimensions.push(f);
                }
                else if (f.analyticType === 'measure') {
                    viewMeasures.push(f);
                }
            }
        }
        return { allFields, viewDimensions, viewMeasures, filters };
    }, [encodings]);
    const { viewData: data, loading: waiting } = useRenderer({
        allFields,
        viewDimensions,
        viewMeasures,
        filters,
        defaultAggregated: config.defaultAggregated,
        sort,
        folds: config.folds,
        limit: config.limit ?? -1,
        computationFunction: computation,
        timezoneDisplayOffset: config['timezoneDisplayOffset'],
    });
    const { i18n } = useTranslation();
    return (React.createElement(Card, null,
        React.createElement("div", { className: "p-6 pb-2 flex space-x-2 items-center" },
            React.createElement("div", { className: "p-1 w-6 h-6 rounded-full bg-muted" },
                React.createElement(CpuChipIcon, { className: "w-4 h-4" })),
            React.createElement(CardTitle, { className: "flex-1" }, "Viz.GPT"),
            props.onRemove && (React.createElement(Button, { variant: "ghost", size: "icon-sm", onClick: props.onRemove },
                React.createElement(TrashIcon, { className: "w-4 h-4" })))),
        React.createElement(CardContent, { className: "pl-16" },
            waiting && React.createElement(LoadingLayer, null),
            React.createElement(SpecRenderer, { vizThemeConfig: vizThemeConfig, name: name, data: data, draggableFieldState: encodings, visualConfig: config, layout: {
                    ...layout,
                    size: {
                        mode: 'auto',
                        width: 300,
                        height: 200,
                    },
                }, locale: i18n.language, scales: props.scales }))));
});
const api = 'https://api.kanaries.net/vis/chat2gw';
export const VegaliteChat = observer(function VegaliteChat(props) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const vizStore = useVizStore();
    const { chatMessages, allFields } = vizStore;
    const { reportError } = useReporter();
    const submit = async () => {
        setLoading(true);
        queryChat(props.api || api, { chats: chatMessages, metas: allFields, query }, props.headers ?? {})
            .then((res) => {
            vizStore.replaceWithNLPQuery(query, JSON.stringify(res));
            setQuery('');
        })
            .catch((err) => {
            reportError(parseErrorMessage(err), 502);
        })
            .finally(() => {
            setLoading(false);
        });
    };
    return (React.createElement("div", { className: "flex flex-col gap-4 p-4 pb-12" },
        chatMessages.map((m, i, arr) => {
            if (m.role === 'assistant') {
                return (React.createElement(AssistantMessage, { message: m, scales: props.scales, key: i, onRemove: i === arr.length - 1 && m.type === 'normal' ? () => vizStore.undo() : undefined }));
            }
            if (m.role === 'user') {
                return React.createElement(UserMessage, { message: m, key: i, onRemove: i === arr.length - 2 && m.type == 'normal' ? () => vizStore.undo() : undefined });
            }
        }),
        React.createElement("div", { className: "flex gap-4" },
            React.createElement(Textarea, { className: "resize-none min-h-[36px]", disabled: loading, rows: 1, value: query, onKeyDown: (e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.shiftKey && loading === false && query.length > 0) {
                        e.preventDefault();
                        submit();
                    }
                }, placeholder: "Ask question about your data", onChange: (e) => setQuery(e.target.value) }),
            React.createElement(Button, { disabled: loading, onClick: submit },
                loading && React.createElement(ArrowPathIcon, { className: "w-3 h-3 mr-2 animate-spin" }),
                "Submit"))));
});
//# sourceMappingURL=index.js.map