export declare const DemoDataAssets: {
    CARS: string;
    STUDENTS: string;
    BTC_GOLD: string;
    BIKE_SHARING: string;
    CAR_SALES: string;
    COLLAGE: string;
    TITANIC: string;
    KELPER: string;
    EARTHQUAKE: string;
} | {
    readonly CARS: "/datasets/ds-cars-service.json";
    readonly STUDENTS: "/datasets/ds-students-service.json";
    readonly BTC_GOLD: "/datasets/ds_btc_gold_service.json";
    readonly BIKE_SHARING: "/datasets/ds-bikesharing-service.json";
    readonly CAR_SALES: "/datasets/ds-carsales-service.json";
    readonly COLLAGE: "/datasets/ds-collage-service.json";
    readonly TITANIC: "/datasets/ds-titanic-service.json";
    readonly KELPER: "/datasets/ds-kelper-service.json";
    readonly EARTHQUAKE: "/datasets/ds-earthquake-service.json";
};
export interface IPublicData {
    key: string;
    title: string;
    desc?: string;
}
export declare const PUBLIC_DATA_LIST: IPublicData[];
