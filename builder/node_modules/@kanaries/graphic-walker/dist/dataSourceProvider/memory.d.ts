import { IDataSourceProvider } from '../interfaces';
export declare function createMemoryProvider(initData?: string | null): IDataSourceProvider & {
    exportData(): string;
};
