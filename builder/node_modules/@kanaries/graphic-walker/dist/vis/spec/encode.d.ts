import { IViewField } from '../../interfaces';
export interface IEncodeProps {
    geomType: string;
    x: IViewField;
    y: IViewField;
    color: IViewField;
    opacity: IViewField;
    size: IViewField;
    shape: IViewField;
    xOffset: IViewField;
    yOffset: IViewField;
    row: IViewField;
    column: IViewField;
    theta: IViewField;
    radius: IViewField;
    details: Readonly<IViewField[]>;
    text: IViewField;
    displayOffset?: number;
    vegaConfig?: any;
}
export declare function availableChannels(geomType: string): Set<string>;
export declare function encodeFid(fid: string): string;
export declare function channelEncode(props: IEncodeProps): {
    [key: string]: any;
};
