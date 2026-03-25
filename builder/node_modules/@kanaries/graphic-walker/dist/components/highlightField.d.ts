import React from 'react';
export interface TextFieldProps {
    placeholder?: string;
    onChange?: (v: string) => void;
    value: string;
}
export declare function highlightField(highlighter: (value: string) => string): React.ForwardRefExoticComponent<TextFieldProps & React.RefAttributes<HTMLDivElement>>;
