import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination as PaginationRoot, PaginationEllipsis, PaginationItem, PaginationNext, PaginationPrevious, PaginationContent, PaginationLink, } from '../ui/pagination';
export function getShowIndices(total, pageIndex, pageSize, extendPageNumber) {
    const totalPage = Math.ceil(total / (pageSize || 1));
    const pages = [
        {
            index: 0,
            disabled: false,
            type: 'page',
        },
        ...new Array(1 + extendPageNumber * 2).fill(0).map((p, i) => ({
            index: pageIndex - (extendPageNumber - i),
            disabled: false,
            type: 'page',
        })),
        {
            index: totalPage - 1,
            disabled: false,
            type: 'page',
        },
    ].filter((p) => p.index >= 0 && p.index < totalPage);
    const pagesUnique = [];
    const indexSet = new Set();
    for (let p of pages) {
        if (!indexSet.has(p.index)) {
            pagesUnique.push(p);
            indexSet.add(p.index);
        }
    }
    const pageResult = pagesUnique.reduce((acc, p) => {
        if (acc.length === 0) {
            return [p];
        }
        const last = acc[acc.length - 1];
        if (p.index === last.index + 1) {
            return [...acc, p];
        }
        return [...acc, { index: -1, type: 'placeholder' }, p];
    }, []);
    return pageResult;
}
export default function Pagination(props) {
    const { total, onNext, onPrev, pageIndex, onPageChange, pageSize = 100, extendPageNumber = 1 } = props;
    const { t } = useTranslation();
    const showIndices = useMemo(() => getShowIndices(total, pageIndex, pageSize, extendPageNumber), [pageIndex, pageSize, extendPageNumber, total, pageIndex]);
    const pageButton = (index) => {
        return (React.createElement(PaginationItem, { key: index },
            React.createElement(PaginationLink, { size: "default", className: 'px-3 min-w-[2.25rem]', isActive: index === pageIndex, onClick: () => {
                    onPageChange && onPageChange(index);
                } }, index + 1)));
    };
    return showIndices.length > 0 ? (React.createElement(PaginationRoot, null,
        React.createElement(PaginationContent, null,
            React.createElement(PaginationItem, null,
                React.createElement(PaginationPrevious, { onClick: () => {
                        onPrev();
                    } }, t('actions.prev'))),
            showIndices.map((x) => {
                if (x.type === 'placeholder') {
                    return (React.createElement(PaginationItem, { key: x.index },
                        React.createElement(PaginationEllipsis, null)));
                }
                return pageButton(x.index);
            }),
            React.createElement(PaginationItem, null,
                React.createElement(PaginationNext, { onClick: () => {
                        onNext();
                    } }, t('actions.next')))))) : null;
}
//# sourceMappingURL=pagination.js.map