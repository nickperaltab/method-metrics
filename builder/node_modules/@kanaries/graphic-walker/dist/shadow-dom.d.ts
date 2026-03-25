import React, { HTMLAttributes } from 'react';
import { IUIThemeConfig } from './interfaces';
export declare const ShadowDomContext: React.Context<{
    root: ShadowRoot | null;
}>;
interface IShadowDomProps extends HTMLAttributes<HTMLDivElement> {
    uiTheme?: IUIThemeConfig;
    onMount?: (shadowRoot: ShadowRoot) => void;
    onUnmount?: () => void;
}
export declare const ShadowDom: React.FC<IShadowDomProps>;
export {};
