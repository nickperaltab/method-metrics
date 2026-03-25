import { sortBy } from '../lib/sort';
const main = (e) => {
    try {
        const { data, viewMeasures, sort } = e.data;
        const ans = sortBy(data, viewMeasures, sort);
        self.postMessage(ans);
    }
    catch (err) {
        console.error(err.stack);
        self.postMessage(err.stack);
    }
};
self.addEventListener('message', main, false);
//# sourceMappingURL=sort.worker.js.map