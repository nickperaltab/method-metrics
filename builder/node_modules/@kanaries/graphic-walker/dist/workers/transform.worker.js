import { transformData } from '../lib/transform';
const main = (e) => {
    const { dataSource, trans } = e.data;
    transformData(dataSource, trans)
        .then((ans) => {
        self.postMessage(ans);
    })
        .catch((error) => {
        console.error(error.stack);
        self.postMessage(error.stack);
    });
};
self.addEventListener('message', main, false);
//# sourceMappingURL=transform.worker.js.map