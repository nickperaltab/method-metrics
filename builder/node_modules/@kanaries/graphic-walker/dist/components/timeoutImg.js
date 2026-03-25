import React, { useRef, useState, useEffect } from 'react';
export const ImageWithFallback = (props) => {
    const { src, fallbackSrc, timeout, ...rest } = props;
    const [failed, setFailed] = useState(false);
    const imgLoadedOnInitSrc = useRef(false);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!imgLoadedOnInitSrc.current)
                setFailed(true);
        }, timeout);
        return () => clearTimeout(timer);
    }, []);
    return (React.createElement("img", { ...rest, src: failed ? fallbackSrc : src, onError: () => {
            setFailed(true);
        }, onLoad: () => {
            imgLoadedOnInitSrc.current = true;
        } }));
};
//# sourceMappingURL=timeoutImg.js.map