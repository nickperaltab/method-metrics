import { IPaintDimension, IPaintMap, IPaintMapV2, IRow } from '../interfaces';
/**
 * Returns Points of a Circle.
 * @param dia Diameter of the circle.
 * @returns Points of the Circle.
 */
export declare const getCircle: (dia: number) => [number, number][];
/**
 * Returns Points of a Circle with specified center at in a map.
 * @param center Coordination of center of the circle.
 * @param dia Diameter of the circle.
 * @param mapWidth Width of the Map (points outside map will be croped)
 * @returns Points of the circle in the map.
 */
export declare function getCircleFrom([x0, y0]: [number, number], dia: number, mapWidth: number): number[][];
/**
 * Returns Indexes of circle points with specified center at in a map.
 * @param center Coordination of center of the circle.
 * @param dia Diameter of the circle.
 * @param mapWidth Width of the Map (points outside map will be croped)
 * @returns Indexes of circle points in the map.
 */
export declare function getCircleIndexes(center: [number, number], dia: number, dimensions: [IPaintDimension, IPaintDimension]): number[];
/**
 * Compress a Uint8Array.
 * @param arr Uint8Array to be compressed.
 * @returns Promise of the compressed data in base64-string.
 */
export declare function compressBitMap(arr: Uint8Array): Promise<string>;
/**
 * Decompress a base64-string to Uint8Array.
 * @param base64 base64-string to be decompressed.
 * @returns Promise of the decompressed data.
 */
export declare function decompressBitMap(base64: string): Promise<Uint8Array>;
export declare function createBitMapForMap(dimensions: IPaintDimension[]): Uint8Array;
/**
 * calc the item index in the map.
 * @param domain domain of the item.
 * @param item value of the item.
 * @param mapWidth width of the map.
 * @returns index of the item in the map.
 */
export declare function calcIndexInPaintMap(domain: [number, number], item: number, mapWidth: number): number;
/**
 * calc indexes of items in X and Y axises in the map.
 * @param dataX data of item in X axis.
 * @param dataY data of item in Y axis.
 * @param domainX domain of item in X axis.
 * @param domainY domain of item in Y axis.
 * @param mapWidth width of the map.
 * @returns index of items in the map.
 */
export declare function calcIndexesInPaintMap(dataX: number[], dataY: number[], domainX: [number, number], domainY: [number, number], mapWidth: number): number[];
/**
 * calc result of items in paintMap.
 * @param dataX data of item in X axis.
 * @param dataY data of item in Y axis.
 * @param paintMap the PaintMap to use.
 * @returns
 */
export declare function calcPaintMap(dataX: number[], dataY: number[], paintMap: IPaintMap): Promise<string[]>;
/**
 * calc indexes of items in the map.
 * @param dimensions the dimensions of the map
 * @returns mapper for data.
 */
export declare function calcIndexesByDimensions(dimensions: IPaintDimension[]): (data: IRow) => number;
export declare function IPaintMapAdapter(paintMap: IPaintMap): IPaintMapV2;
/**
 * calc result of items in paintMap.
 * @param data data
 * @param paintMap paintMap
 * @returns result
 */
export declare function calcPaintMapV2(data: IRow[], paintMap: IPaintMapV2): Promise<string[]>;
