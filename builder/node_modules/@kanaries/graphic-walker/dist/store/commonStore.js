import { makeAutoObservable, observable, toJS } from 'mobx';
import { transData } from '../dataSource/utils';
export class CommonStore {
    tmpDSName = '';
    tmpDSRawFields = [];
    tmpDataSource = [];
    showDSPanel = false;
    provider;
    onCommitDS;
    displayOffset;
    constructor(provider, onCommitDS, config) {
        this.provider = provider;
        this.onCommitDS = onCommitDS;
        this.displayOffset = config.displayOffset;
        makeAutoObservable(this, {
            tmpDataSource: observable.ref,
        });
    }
    setShowDSPanel(show) {
        this.showDSPanel = show;
    }
    initTempDS() {
        this.tmpDSName = 'New Dataset';
        this.tmpDSRawFields = [];
        this.tmpDataSource = [];
    }
    updateTempFields(fields) {
        this.tmpDSRawFields = fields;
    }
    updateTempDatasetMetas(fid, diffMeta) {
        const field = this.tmpDSRawFields.find((f) => f.fid === fid);
        if (field) {
            for (let mk in diffMeta) {
                field[mk] = diffMeta[mk];
            }
        }
    }
    updateTempFieldAnalyticType(fieldKey, analyticType) {
        const field = this.tmpDSRawFields.find((f) => f.fid === fieldKey);
        if (field) {
            field.analyticType = analyticType;
        }
    }
    updateTempFieldSemanticType(fieldKey, semanticType) {
        const field = this.tmpDSRawFields.find((f) => f.fid === fieldKey);
        if (field) {
            field.semanticType = semanticType;
        }
    }
    updateTempName(name) {
        this.tmpDSName = name;
    }
    updateTempDS(rawData) {
        const result = transData(rawData);
        this.tmpDataSource = result.dataSource;
        this.tmpDSRawFields = result.fields;
    }
    /**
     * update temp dataset (standard) with dataset info
     * @param dataset
     */
    updateTempSTDDS(dataset) {
        this.tmpDataSource = dataset.dataSource;
        this.tmpDSRawFields = dataset.rawFields;
        this.tmpDSName = dataset.name;
    }
    commitTempDS() {
        const { tmpDSName, tmpDSRawFields, tmpDataSource } = this;
        this.provider.addDataSource(toJS(tmpDataSource), toJS(tmpDSRawFields), tmpDSName).then(this.onCommitDS);
        this.setShowDSPanel(false);
        this.initTempDS();
    }
    startDSBuildingTask() {
        this.initTempDS();
        this.showDSPanel = true;
    }
    setDisplayOffset(displayOffset) {
        this.displayOffset = displayOffset;
    }
}
//# sourceMappingURL=commonStore.js.map