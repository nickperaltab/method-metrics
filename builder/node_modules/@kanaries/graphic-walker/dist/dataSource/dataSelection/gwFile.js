import React from 'react';
const GWFile = (props) => {
    return (React.createElement("input", { style: { display: 'none' }, type: "file", ref: props.fileRef, onChange: (e) => {
            const files = e.target.files;
            if (files !== null) {
                const file = files[0];
                props.onImport(file);
            }
        } }));
};
export default GWFile;
//# sourceMappingURL=gwFile.js.map