import { observer } from 'mobx-react-lite';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ComputationContext, useCompututaion, useVizStore } from '../../store';
import Tabs from './tabs';
import DropdownSelect from '../../components/dropdownSelect';
import { COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID } from '../../constants';
import { GLOBAL_CONFIG } from '../../config';
import { toWorkflow } from '../../utils/workflow';
import { useRefControledState } from '../../hooks';
import { getFilterMeaAggKey } from '../../utils';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
const aggregationList = GLOBAL_CONFIG.AGGREGATOR_LIST.map((x) => ({
    label: x,
    value: x,
})).concat([{ label: '-', value: '_none' }]);
const QuantitativeRuleForm = ({ allFields, field, onChange, displayOffset }) => {
    return React.createElement(Tabs, { field: field, onChange: onChange, tabs: ['range', 'one of'], allFields: allFields, displayOffset: displayOffset });
};
const NominalRuleForm = ({ allFields, field, onChange, displayOffset }) => {
    return React.createElement(Tabs, { field: field, onChange: onChange, tabs: ['one of'], allFields: allFields, displayOffset: displayOffset });
};
const OrdinalRuleForm = ({ allFields, field, onChange, displayOffset }) => {
    return React.createElement(Tabs, { field: field, onChange: onChange, tabs: ['one of'], allFields: allFields, displayOffset: displayOffset });
};
const TemporalRuleForm = ({ allFields, field, onChange, displayOffset }) => {
    return React.createElement(Tabs, { field: field, onChange: onChange, tabs: ['temporal range', 'one of'], allFields: allFields, displayOffset: displayOffset });
};
const EmptyForm = () => React.createElement(React.Fragment, null);
export const PureFilterEditDialog = (props) => {
    const { editingFilterIdx, viewFilters, meta, options, onSelectFilter, onWriteFilter, onClose, onSelectAgg } = props;
    const { t } = useTranslation('translation', { keyPrefix: 'filters' });
    const field = React.useMemo(() => {
        return editingFilterIdx !== null ? viewFilters[editingFilterIdx] : null;
    }, [editingFilterIdx, viewFilters]);
    const [uncontrolledField, setUncontrolledField] = useRefControledState(field);
    const handleChange = React.useCallback((r) => {
        if (editingFilterIdx !== null) {
            setUncontrolledField((uf) => ({
                ...uf,
                rule: r,
            }));
        }
    }, [editingFilterIdx]);
    const handleSubmit = React.useCallback(() => {
        if (editingFilterIdx !== null) {
            onWriteFilter(editingFilterIdx, uncontrolledField?.rule ?? null);
        }
        onClose();
    }, [editingFilterIdx, uncontrolledField?.rule, onWriteFilter]);
    const Form = field
        ? {
            quantitative: QuantitativeRuleForm,
            nominal: NominalRuleForm,
            ordinal: OrdinalRuleForm,
            temporal: TemporalRuleForm,
        }[field.semanticType]
        : EmptyForm;
    return uncontrolledField ? (React.createElement(Dialog, { open: Boolean(uncontrolledField), onOpenChange: onClose },
        React.createElement(DialogContent, null,
            React.createElement(DialogHeader, null,
                React.createElement(DialogTitle, null, t('editing'))),
            React.createElement("div", { className: "pt-4 text-xs" },
                React.createElement("div", { className: "grid grid-cols-2 gap-4" },
                    React.createElement("div", null,
                        React.createElement("div", { className: "py-1" }, t('form.name')),
                        React.createElement(DropdownSelect, { buttonClassName: "w-96", className: "mb-2", options: options, selectedKey: uncontrolledField.fid, onSelect: onSelectFilter })),
                    onSelectAgg && editingFilterIdx !== null && uncontrolledField.analyticType === 'measure' && (React.createElement("div", null,
                        React.createElement("div", { className: "py-1" }, t('form.aggregation')),
                        React.createElement(DropdownSelect, { buttonClassName: "w-96", className: "mb-2", options: aggregationList, selectedKey: uncontrolledField.enableAgg ? uncontrolledField.aggName ?? '' : '', onSelect: (v) => onSelectAgg(editingFilterIdx, v === '' ? null : v) })))),
                React.createElement(Form, { allFields: meta, key: getFilterMeaAggKey(uncontrolledField), field: uncontrolledField, onChange: handleChange, displayOffset: props.displayOffset }),
                React.createElement(DialogFooter, null,
                    React.createElement(Button, { onClick: handleSubmit, children: t('btn.confirm') }),
                    React.createElement(Button, { variant: "outline", onClick: onClose, children: t('btn.cancel') })))))) : null;
};
const FilterEditDialog = observer(() => {
    const vizStore = useVizStore();
    const { editingFilterIdx, viewFilters, dimensions, measures, meta, allFields, viewDimensions, config } = vizStore;
    const { timezoneDisplayOffset } = config;
    const computation = useCompututaion();
    const originalField = editingFilterIdx !== null
        ? viewFilters[editingFilterIdx]?.enableAgg
            ? allFields.find((x) => x.fid === viewFilters[editingFilterIdx].fid)
            : undefined
        : undefined;
    const filterAggName = editingFilterIdx !== null ? (viewFilters[editingFilterIdx]?.enableAgg ? viewFilters[editingFilterIdx].aggName : undefined) : undefined;
    const transformedComputation = useMemo(() => {
        if (originalField && viewDimensions.length > 0) {
            const preWorkflow = toWorkflow([], allFields, viewDimensions, [{ ...originalField, aggName: filterAggName }], true, 'none', [], undefined, timezoneDisplayOffset).map((x) => {
                if (x.type === 'view') {
                    return {
                        ...x,
                        query: x.query.map((q) => {
                            if (q.op === 'aggregate') {
                                return { ...q, measures: q.measures.map((m) => ({ ...m, asFieldKey: m.field })) };
                            }
                            return q;
                        }),
                    };
                }
                return x;
            });
            return (query) => computation({
                ...query,
                workflow: preWorkflow.concat(query.workflow.filter((x) => x.type !== 'transform')),
            });
        }
        else {
            return computation;
        }
    }, [computation, viewDimensions, originalField, filterAggName]);
    const handelClose = React.useCallback(() => vizStore.closeFilterEditing(), [vizStore]);
    const handleWriteFilter = React.useCallback((index, rule) => {
        if (index !== null) {
            vizStore.writeFilter(index, rule ?? null);
        }
    }, [vizStore]);
    const handleSelectFilterField = (fieldKey) => {
        const existingFilterIdx = viewFilters.findIndex((field) => field.fid === fieldKey);
        if (existingFilterIdx >= 0) {
            vizStore.setFilterEditing(existingFilterIdx);
        }
        else {
            const sourceKey = dimensions.find((field) => field.fid === fieldKey) ? 'dimensions' : 'measures';
            const sourceIndex = sourceKey === 'dimensions' ? dimensions.findIndex((field) => field.fid === fieldKey) : measures.findIndex((field) => field.fid === fieldKey);
            if (editingFilterIdx !== null) {
                vizStore.modFilter(editingFilterIdx, sourceKey, sourceIndex);
            }
        }
    };
    const allFieldOptions = React.useMemo(() => {
        return allFields
            .filter((x) => ![COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID].includes(x.fid))
            .map((d) => ({
            label: d.name,
            value: d.fid,
        }));
    }, [allFields]);
    const handleChangeAgg = (index, agg) => {
        vizStore.setFilterAggregator(index, agg ?? '');
    };
    return (React.createElement(ComputationContext.Provider, { value: transformedComputation },
        React.createElement(PureFilterEditDialog, { options: allFieldOptions, editingFilterIdx: editingFilterIdx, displayOffset: timezoneDisplayOffset, meta: meta, onClose: handelClose, onSelectFilter: handleSelectFilterField, onWriteFilter: handleWriteFilter, viewFilters: viewFilters, onSelectAgg: handleChangeAgg })));
});
export default FilterEditDialog;
//# sourceMappingURL=filterEditDialog.js.map