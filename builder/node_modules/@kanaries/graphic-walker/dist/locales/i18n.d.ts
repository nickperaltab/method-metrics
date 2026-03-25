import { Resource } from 'i18next';
export declare const mergeLocaleRes: (resources: {
    [lang: string]: Resource;
}) => void;
export declare const setLocaleLanguage: (lang: string) => Promise<import("i18next").TFunction>;
