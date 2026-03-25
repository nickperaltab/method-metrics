import React from 'react';
export interface ITabOption {
    label: string;
    key: string;
    editable?: boolean;
}
interface EditableTabsProps {
    tabs: ITabOption[];
    selectedKey: string;
    showRemove?: boolean;
    onSelected: (selectedKey: string, index: number) => void;
    onEditLabel?: (label: string, index: number) => void;
    onDuplicate?: (index: number) => void;
    onRemove?: (index: number) => void;
}
export default function EditableTabs(props: EditableTabsProps): React.JSX.Element;
export {};
