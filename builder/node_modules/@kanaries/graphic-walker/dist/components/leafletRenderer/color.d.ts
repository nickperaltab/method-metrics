import React from 'react';
import { IField } from '../../interfaces';
import { ColorDisplay } from './encodings';
export default function ColorPanel(props: {
    display: ColorDisplay;
    field: IField;
    aggerated?: boolean;
}): React.JSX.Element;
