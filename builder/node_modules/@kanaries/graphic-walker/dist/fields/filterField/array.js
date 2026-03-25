import { OrderedMap } from 'immutable';
export class SparseArray {
    tree;
    constructor(tree) {
        this.tree = tree || OrderedMap();
    }
    static create() {
        return new SparseArray();
    }
    get(index) {
        return this.tree.has(index) ? this.tree.get(index) : null;
    }
    set(index, item) {
        const newTree = this.tree.set(index, item);
        return new SparseArray(newTree);
    }
    slice(start, end) {
        const result = [];
        for (let i = start; i < end; i++) {
            result.push(this.get(i));
        }
        return result;
    }
    putIn(start, items) {
        let newTree = this.tree;
        for (let i = 0; i < items.length; i++) {
            newTree = newTree.set(start + i, items[i]);
        }
        return new SparseArray(newTree);
    }
}
//# sourceMappingURL=array.js.map