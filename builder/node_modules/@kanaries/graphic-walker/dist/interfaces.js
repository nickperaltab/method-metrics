export var ISegmentKey;
(function (ISegmentKey) {
    ISegmentKey["vis"] = "vis";
    ISegmentKey["data"] = "data";
    ISegmentKey["chat"] = "chat";
})(ISegmentKey || (ISegmentKey = {}));
function toDict(a) {
    return Object.fromEntries(a.map((x) => [x, x]));
}
export const ColorSchemes = {
    /**
     * @name Categorical Schemes
     * @summary For nominal data.
     * @description Categorical color schemes can be used to encode discrete data values, each representing a distinct category.
     */
    discrete: toDict([
        'accent',
        'category10',
        'category20',
        'category20b',
        'category20c',
        'dark2',
        'paired',
        'pastel1',
        'pastel2',
        'set1',
        'set2',
        'set3',
        'tableau10',
        'tableau20',
    ]),
    /**
     * @name Sequential Single-Hue Schemes
     * @summary For increasing quantitative data.
     * @description Sequential color schemes can be used to encode quantitative values. These color ramps are designed to encode increasing numeric values.
     */
    single: toDict(['blues', 'tealblues', 'teals', 'greens', 'browns', 'oranges', 'reds', 'purples', 'warmgreys', 'greys']),
    /**
     * @name Sequential Multi-Hue Schemes
     * @summary For quantitative data in heatmaps.
     * @description Sequential color schemes can be used to encode quantitative values. These color ramps are designed to encode increasing numeric values, but use additional hues for more color discrimination, which may be useful for visualizations such as heatmaps. However, beware that using multiple hues may cause viewers to inaccurately see the data range as grouped into color-coded clusters.
     */
    multi: toDict([
        'viridis',
        'magma',
        'inferno',
        'plasma',
        'cividis',
        'turbo',
        'bluegreen',
        'bluepurple',
        'goldgreen',
        'goldorange',
        'goldred',
        'greenblue',
        'orangered',
        'purplebluegreen',
        'purpleblue',
        'purplered',
        'redpurple',
        'yellowgreenblue',
        'yellowgreen',
        'yelloworangebrown',
        'yelloworangered',
        'darkblue',
        'darkgold',
        'darkgreen',
        'darkmulti',
        'darkred',
        'lightgreyred',
        'lightgreyteal',
        'lightmulti',
        'lightorange',
        'lighttealblue',
    ]),
    /**
     * @name Diverging Schemes
     * @summary For quantitative data with meaningful mid-point.
     * @description Diverging color schemes can be used to encode quantitative values with a meaningful mid-point, such as zero or the average value. Color ramps with different hues diverge with increasing saturation to highlight the values below and above the mid-point.
     */
    deiverging: toDict([
        'blueorange',
        'brownbluegreen',
        'purplegreen',
        'pinkyellowgreen',
        'purpleorange',
        'redblue',
        'redgrey',
        'redyellowblue',
        'redyellowgreen',
        'spectral',
    ]),
    /**
     * @name Cyclical Schemes
     * @summary For quantitative data with periodic patterns.
     * @description Cyclical color schemes may be used to highlight periodic patterns in continuous data. However, these schemes are not well suited to accurately convey value differences.
     */
    cyclical: toDict(['rainbow', 'sinebow']),
};
export const IDataSourceEventType = {
    updateList: 1,
    updateMeta: 2,
    updateSpec: 4,
    updateData: 8,
};
export const IStoInfoV2SchemaUrl = 'https://graphic-walker.kanaries.net/stoinfo_v2.json';
//# sourceMappingURL=interfaces.js.map