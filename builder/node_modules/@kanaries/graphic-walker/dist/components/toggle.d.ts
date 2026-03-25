import React from 'react';
interface ToggleProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    label?: string;
}
export default function Toggle(props: ToggleProps): React.JSX.Element;
export {};
