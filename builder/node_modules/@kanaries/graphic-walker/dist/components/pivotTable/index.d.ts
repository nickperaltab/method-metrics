import React from 'react';
import { DraggableFieldState, IRow, IThemeKey, IVisualConfigNew, IVisualLayout } from '../../interfaces';
import { GWGlobalConfig } from "../../vis/theme";
interface PivotTableProps {
    vizThemeConfig?: IThemeKey | GWGlobalConfig;
    data: IRow[];
    draggableFieldState: DraggableFieldState;
    visualConfig: IVisualConfigNew;
    layout: IVisualLayout;
    disableCollapse?: boolean;
}
declare const PivotTable: React.FC<PivotTableProps>;
export default PivotTable;
