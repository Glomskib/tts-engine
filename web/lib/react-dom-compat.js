/**
 * Shim for react-dom that adds back unmountComponentAtNode (removed in React 19).
 * Only used on the client via the webpack alias in next.config.ts so that
 * react-joyride@2.x can resolve the export at compile time.
 */
'use strict';

const ReactDOM = require('react-dom');

module.exports = {
  ...ReactDOM,
  unmountComponentAtNode: ReactDOM.unmountComponentAtNode || function () { return false; },
};
