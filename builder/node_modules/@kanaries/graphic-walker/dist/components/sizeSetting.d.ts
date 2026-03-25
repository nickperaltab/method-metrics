import React from 'react';
interface SizeSettingProps {
    onWidthChange: (val: number) => void;
    onHeightChange: (val: number) => void;
    width: number;
    height: number;
    children?: React.ReactNode | Iterable<React.ReactNode>;
}
export declare const ResizeDialog: React.FC<SizeSettingProps>;
declare const SizeSetting: React.FC<SizeSettingProps>;
export default SizeSetting;
