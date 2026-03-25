import { IChannelScales, IChatMessage, IViewField } from "../../interfaces";
import React from 'react';
export declare const VegaliteChat: React.FunctionComponent<{
    api: string | ((metas: IViewField[], chats: IChatMessage[]) => PromiseLike<any> | any);
    headers?: Record<string, string> | undefined;
    scales?: IChannelScales | undefined;
}>;
