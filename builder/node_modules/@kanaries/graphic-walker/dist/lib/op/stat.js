import { isNotEmpty } from "../../utils";
export function mean(nums) {
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}
export function sum(nums) {
    return nums.reduce((a, b) => a + b, 0);
}
export function median(nums) {
    const sorted = nums.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid] + sorted[mid - 1]) / 2 : sorted[mid];
}
export function variance(nums) {
    const m = mean(nums);
    return mean(nums.map((x) => (x - m) ** 2));
}
export function stdev(nums) {
    return Math.sqrt(variance(nums));
}
export function max(nums) {
    let ans = -Infinity;
    for (let n of nums) {
        if (n > ans) {
            ans = n;
        }
    }
    return ans;
}
export function min(nums) {
    let ans = Infinity;
    for (let n of nums) {
        if (n < ans) {
            ans = n;
        }
    }
    return ans;
}
export function count(nums) {
    return nums.length;
}
export function countTruly(nums) {
    return nums.filter(isNotEmpty).length;
}
export function distinctCount(datas) {
    return new Set(datas).size;
}
//# sourceMappingURL=stat.js.map