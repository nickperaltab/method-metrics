import React from 'react';
interface GWFileProps {
    fileRef: React.RefObject<HTMLInputElement>;
    onImport: (file: File) => void;
}
declare const GWFile: React.FC<GWFileProps>;
export default GWFile;
