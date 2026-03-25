export function addBinStep(encoding, dataSource) {
    Object.keys(encoding).forEach((c) => {
        if (encoding[c].bin && dataSource[0]?.[encoding[c].field.replace('[0]', '')]) {
            const data = dataSource[0][encoding[c].field.replace('[0]', '')];
            encoding[c].bin.step = data[1] - data[0];
        }
    });
    return encoding;
}
//# sourceMappingURL=bin.js.map