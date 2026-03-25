import { filter } from '../lib/filter';
const main = (e) => {
    const { dataSource, filters } = e.data;
    const filtered = filter(dataSource, filters);
    self.postMessage(filtered);
};
self.addEventListener('message', main, false);
//# sourceMappingURL=filter.worker.js.map