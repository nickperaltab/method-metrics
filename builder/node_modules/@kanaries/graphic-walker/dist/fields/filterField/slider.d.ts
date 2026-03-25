import React from 'react';
interface SliderProps {
    min: number;
    max: number;
    value: [number | null, number | null];
    onChange: (value: [number, number]) => void;
}
declare const Slider: React.FC<SliderProps>;
export default Slider;
