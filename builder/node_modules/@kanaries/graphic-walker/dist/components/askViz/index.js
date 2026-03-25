import { observer } from 'mobx-react-lite';
import React, { useCallback, useState } from 'react';
import { useVizStore } from '../../store';
import { HandThumbDownIcon, HandThumbUpIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import Spinner from '../spinner';
import { useTranslation } from 'react-i18next';
import { useReporter } from '../../utils/reportError';
import { parseErrorMessage } from '../../utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
const api = import.meta.env.DEV ? 'http://localhost:2023/api/vis/text2gw' : 'https://api.kanaries.net/vis/text2gw';
async function vizQuery(api, metas, query, headers) {
    const res = await fetch(api, {
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({
            metas,
            messages: [
                {
                    role: 'user',
                    content: query,
                },
            ],
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
async function reportVizQuery(api, data, headers) {
    if (typeof api === 'function') {
        return api(data);
    }
    const res = await fetch(api, {
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
        return;
    }
    else {
        throw new Error(result.message);
    }
}
const AskViz = (props) => {
    const { feedbackApi } = props;
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const vizStore = useVizStore();
    const { t } = useTranslation();
    const [askVizFeedback, setAskVizFeedback] = useState('none');
    const allFields = vizStore.allFields;
    const { reportError } = useReporter();
    const [lastData, setLastData] = useState(null);
    const startQuery = useCallback(() => {
        setLoading(true);
        const request = typeof props.api === 'function' ? Promise.resolve(props.api(allFields, query)) : vizQuery(props.api || api, allFields, query, props.headers ?? {});
        request
            .then((data) => {
            vizStore.appendFromCode(data);
            vizStore.setAskvizFeedback(true);
            setLastData({ question: query, data: JSON.stringify(data) });
            setAskVizFeedback('vote');
        })
            .catch((err) => {
            reportError(parseErrorMessage(err), 502);
        })
            .finally(() => {
            setLoading(false);
        });
    }, [props.api, props.headers, allFields, query, vizStore]);
    const showFeedback = feedbackApi && lastData && vizStore.showAskvizFeedbackIndex === vizStore.visIndex;
    return (React.createElement("div", { className: "right-0 flex relative" },
        React.createElement(Input, { type: "text", className: "pr-24", placeholder: t('main.tabpanel.askviz.placeholder'), value: query, onChange: (e) => setQuery(e.target.value), onKeyDown: (e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && loading === false && query.length > 0) {
                    startQuery();
                }
            }, disabled: loading || allFields.length === 0 }),
        React.createElement(Button, { className: "rounded-l-none w-20 absolute inset-y-0 right-0", disabled: loading || query.length === 0 || allFields.length === 0, onClick: startQuery, id: "askviz_ask" },
            "Ask",
            !loading && React.createElement(PaperAirplaneIcon, { className: "w-4 ml-1" }),
            loading && React.createElement(Spinner, { className: "w-4 h-4 ml-1" })),
        showFeedback && askVizFeedback === 'vote' && (React.createElement("div", { className: "absolute z-10 top-full right-0 flex-col space-y-2 w-56 mt-1 p-4 border rounded bg-popover text-popover-foreground" },
            React.createElement("div", null, t('App.feedback.vote')),
            React.createElement("div", { className: "flex space-x-2" },
                React.createElement(Button, { type: "button", onClick: () => {
                        reportVizQuery(feedbackApi, { action: 'voteup', question: lastData.question, spec: lastData.data }, props.headers ?? {});
                        setAskVizFeedback('none');
                    } },
                    React.createElement(HandThumbUpIcon, { className: "w-4 h-4" }),
                    t('App.feedback.voteup')),
                React.createElement(Button, { type: "button", variant: "outline", onClick: () => {
                        reportVizQuery(feedbackApi, { action: 'votedown', question: lastData.question, spec: lastData.data }, props.headers ?? {});
                        setAskVizFeedback('report');
                    } },
                    React.createElement(HandThumbDownIcon, { className: "w-4 h-4" }),
                    t('App.feedback.votedown'))))),
        showFeedback && askVizFeedback === 'report' && (React.createElement("div", { className: "absolute z-10 top-full right-0 flex-col space-y-2 w-56 mt-1 p-4 border rounded bg-popover text-popover-foreground" },
            React.createElement("div", null, t('App.feedback.report')),
            React.createElement("div", null,
                React.createElement(Button, { type: "button", variant: "outline", disabled: !vizStore.canUndo, onClick: () => {
                        reportVizQuery(feedbackApi, { action: 'report', question: lastData.question, spec: JSON.stringify(vizStore.exportCode()[vizStore.visIndex]) }, props.headers ?? {});
                        setAskVizFeedback('none');
                    } }, t('App.feedback.report_button')))))));
};
export default observer(AskViz);
//# sourceMappingURL=index.js.map