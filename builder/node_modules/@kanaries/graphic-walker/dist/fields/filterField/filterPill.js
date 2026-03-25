import { observer } from 'mobx-react-lite';
import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { PencilSquareIcon } from '@heroicons/react/24/solid';
import { useVizStore } from '../../store';
import { refMapper } from '../fieldsContext';
import { formatDate } from '../../utils';
import { parsedOffsetDate } from '../../lib/op/offset';
const Pill = styled.div `
    user-select: none;
    align-items: stretch;
    border-style: solid;
    border-width: 1px;
    box-sizing: border-box;
    cursor: default;
    display: flex;
    flex-direction: column;
    font-size: 12px;
    min-width: 150px;
    overflow-y: hidden;
    padding: 0;

    > * {
        flex-grow: 1;
        padding-block: 0.2em;
        padding-inline: 0.5em;
    }

    > header {
        height: 20px;
        border-bottom-width: 1px;
    }

    > div.output {
        min-height: 20px;

        > span {
            overflow-y: hidden;
            max-height: 4em;
        }

        .icon {
            display: none;

            &:hover {
                display: unset;
            }
        }
    }
`;
const FilterPill = observer((props) => {
    const { provided, fIndex } = props;
    const vizStore = useVizStore();
    const { viewFilters, config } = vizStore;
    const { timezoneDisplayOffset } = config;
    const field = viewFilters[fIndex];
    const { t } = useTranslation('translation', { keyPrefix: 'filters' });
    const fieldName = field.enableAgg ? `${field.aggName}(${field.name})` : field.name;
    return (React.createElement(Pill, { className: "text-foreground touch-none", ref: refMapper(provided.innerRef), ...provided.draggableProps, ...provided.dragHandleProps },
        React.createElement("header", { className: "bg-secondary" }, fieldName),
        React.createElement("div", { className: "bg-background  text-muted-foreground hover:bg-accent flex flex-row output", onClick: () => vizStore.setFilterEditing(fIndex), style: { cursor: 'pointer' }, title: t('to_edit') },
            field.rule ? (React.createElement("span", { className: "flex-1" },
                field.rule.type === 'one of' && React.createElement(React.Fragment, null,
                    "oneOf: [",
                    [...field.rule.value].map((d) => JSON.stringify(d)).join(', '),
                    "]"),
                field.rule.type === 'range' && (React.createElement(React.Fragment, null,
                    "range: [",
                    field.rule.value[0],
                    ", ",
                    field.rule.value[1],
                    "]")),
                field.rule.type === 'not in' && React.createElement(React.Fragment, null,
                    "notIn: [",
                    [...field.rule.value].map((d) => JSON.stringify(d)).join(', '),
                    "]"),
                field.rule.type === 'temporal range' && (React.createElement(React.Fragment, null,
                    "range: [",
                    field.rule.value[0] ? formatDate(parsedOffsetDate(timezoneDisplayOffset, field.rule.offset)(field.rule.value[0])) : '',
                    ", ",
                    field.rule.value[1] ? formatDate(parsedOffsetDate(timezoneDisplayOffset, field.rule.offset)(field.rule.value[1])) : '',
                    "]")))) : (React.createElement("span", { className: "text-muted-foreground flex-1" }, t('empty_rule'))),
            React.createElement(PencilSquareIcon, { className: "icon flex-grow-0 flex-shrink-0 pointer-events-none text-muted-foreground", role: "presentation", "aria-hidden": true, width: "1.4em", height: "1.4em" }))));
});
export default FilterPill;
//# sourceMappingURL=filterPill.js.map