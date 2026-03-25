import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { unstable_batchedUpdates } from 'react-dom';
import RemoveConfirm from '../removeConfirm';
import { Dialog, DialogContent, DialogFooter, DialogHeader } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
function classNames(...classes) {
    return classes.filter(Boolean).join(' ');
}
const Slider = (props) => {
    const [x, setX] = useState(0);
    const ref = useRef();
    const parentDisposeRef = useRef();
    const childDisposeRef = useRef();
    const onWheel = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        const parentWidth = ref.current?.getBoundingClientRect().width;
        const childWidth = ref.current?.children[0]?.getBoundingClientRect().width;
        if (parentWidth && childWidth) {
            setX((x) => Math.min(Math.max(0, childWidth - parentWidth), Math.max(0, x + e.deltaY + e.deltaX)));
        }
        return false;
    }, []);
    const refCB = useCallback((node) => {
        parentDisposeRef.current?.();
        if (node == null) {
            return;
        }
        const r = new ResizeObserver((es) => {
            for (const e of es) {
                const parentWidth = e.contentRect.width;
                const childWidth = ref.current?.children[0]?.getBoundingClientRect().width;
                if (parentWidth && childWidth) {
                    setX((x) => Math.min(Math.max(0, childWidth - parentWidth), x));
                }
            }
        });
        r.observe(node);
        ref.current = node;
        node.addEventListener('wheel', onWheel, { passive: false });
        parentDisposeRef.current = () => {
            r.disconnect();
            ref.current?.removeEventListener('wheel', onWheel);
        };
    }, [onWheel]);
    const childRefCB = useCallback((node) => {
        childDisposeRef.current?.();
        if (node === null) {
            return;
        }
        const r = new ResizeObserver((es) => {
            for (const e of es) {
                const parentWidth = ref.current?.getBoundingClientRect().width;
                const childWidth = e.contentRect.width;
                if (parentWidth && childWidth) {
                    setX((x) => Math.min(Math.max(0, childWidth - parentWidth), x));
                }
            }
        });
        childDisposeRef.current = () => {
            r.disconnect();
        };
        r.observe(node);
    }, []);
    return (React.createElement("div", { style: { overflowX: 'clip' }, ref: refCB, onWheel: (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.preventDefault();
            setX((x) => Math.max(0, x + e.deltaY));
            return false;
        }, className: props.className },
        React.createElement("div", { ref: childRefCB, style: { left: `-${x}px`, width: 'min-content', position: 'relative' } }, props.children)));
};
export default function EditableTabs(props) {
    const { tabs, selectedKey, onSelected, onEditLabel, onRemove, onDuplicate, showRemove } = props;
    const [editingIndex, setEditingIndex] = useState(-1);
    const [name, setName] = useState('');
    const { t } = useTranslation();
    return (React.createElement("div", { className: "overflow-y-visible" },
        React.createElement(RemoveConfirm, null),
        React.createElement(Dialog, { open: editingIndex > -1, onOpenChange: () => {
                setEditingIndex(-1);
            } },
            React.createElement(DialogContent, null,
                React.createElement(DialogHeader, null, t('main.tablist.chart_name')),
                React.createElement("div", { className: "py-4" },
                    React.createElement(Input, { value: name, onChange: (e) => {
                            setName(e.target.value);
                        } })),
                React.createElement(DialogFooter, null,
                    React.createElement(Button, { variant: "outline", onClick: () => {
                            unstable_batchedUpdates(() => {
                                setEditingIndex(-1);
                                setName('');
                            });
                        } }, t('actions.cancel')),
                    React.createElement(Button, { onClick: () => {
                            unstable_batchedUpdates(() => {
                                onEditLabel && onEditLabel(name, editingIndex);
                                setEditingIndex(-1);
                                setName('');
                            });
                        } }, t('actions.confirm'))))),
        React.createElement(Slider, null,
            React.createElement("nav", { className: "-mb-px flex h-8", role: "tablist", "aria-label": "Tabs" }, tabs.map((tab, tabIndex) => (React.createElement("span", { role: "tab", tabIndex: 0, 
                // dangerouslySetInnerHTML={{
                //     __html: tab.label
                // }}
                onClick: () => {
                    onSelected(tab.key, tabIndex);
                }, key: tab.key, className: classNames(tab.key === selectedKey ? 'border' : 'text-muted-foreground hover:text-accent-foreground hover:bg-accent', 'flex whitespace-nowrap rounded-t group py-1 px-2 pr-2 text-sm cursor-default') },
                tab.label,
                tab.key === selectedKey && tab.editable && (React.createElement(DropdownMenu, null,
                    React.createElement(DropdownMenuTrigger, null,
                        React.createElement(EllipsisVerticalIcon, { className: "h-4 w-4", "aria-hidden": "true" })),
                    React.createElement(DropdownMenuContent, { align: "start" },
                        React.createElement(DropdownMenuItem, { className: "text-xs", onClick: (e) => {
                                e.stopPropagation();
                                unstable_batchedUpdates(() => {
                                    setEditingIndex(tabIndex);
                                    setName(tab.label);
                                });
                            } }, "Edit"),
                        React.createElement(DropdownMenuItem, { className: "text-xs", onClick: (e) => {
                                e.stopPropagation();
                                onDuplicate?.(tabIndex);
                            } }, "Duplicate"),
                        showRemove && (React.createElement(DropdownMenuItem, { className: "text-xs text-destructive", onClick: (e) => {
                                e.stopPropagation();
                                onRemove?.(tabIndex);
                            } }, "Remove"))))))))))));
}
//# sourceMappingURL=editableTab.js.map