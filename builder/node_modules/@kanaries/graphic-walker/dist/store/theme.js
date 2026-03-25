import { createContext } from 'react';
import { zincTheme } from '../utils/colors';
export const themeContext = createContext('light');
export const vegaThemeContext = createContext({});
export const portalContainerContext = createContext(null);
/**
 * for portal shadow doms
 */
export const uiThemeContext = createContext(zincTheme);
//# sourceMappingURL=theme.js.map