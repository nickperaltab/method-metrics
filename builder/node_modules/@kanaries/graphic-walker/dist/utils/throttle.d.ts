declare const throttle: (fn: () => void, time: number, options?: Partial<{
    leading: boolean;
    trailing: boolean;
}>) => (() => void);
export default throttle;
