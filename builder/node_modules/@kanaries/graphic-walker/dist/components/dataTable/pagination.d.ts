import React from 'react';
type IPageItem = {
    index: number;
    disabled?: boolean;
    type: 'page' | 'placeholder';
};
interface PaginationProps {
    total: number;
    onPrev: () => void;
    onNext: () => void;
    onPageChange?: (index: number) => void;
    pageIndex: number;
    pageSize?: number;
    extendPageNumber?: number;
}
export declare function getShowIndices(total: number, pageIndex: number, pageSize: number, extendPageNumber: number): IPageItem[];
export default function Pagination(props: PaginationProps): React.JSX.Element | null;
export {};
