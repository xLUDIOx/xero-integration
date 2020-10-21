/** @typedef {import('ts-jest')} */
/** @type {import('@jest/types').Config.InitialOptions} */

process.env.TESTING = true;

module.exports = {
    "preset": "ts-jest",
    "testMatch": [
        "**/src/**/*.spec.ts",
    ],
    "testPathIgnorePatterns": [
        "/node_modules/",
        "/integration-tests/",
    ],
    "collectCoverage": true,
    "collectCoverageFrom": [
        "src/**/*.ts",
    ],
    "moduleFileExtensions": [
        "ts",
        "tsx",
        "js",
        "jsx",
        "json",
        "node",
    ],
    "moduleNameMapper": {
        "@controllers": "<rootDir>/src/controllers",
        "@managers": "<rootDir>/src/domain-logic",
        "@services": "<rootDir>/src/services",
        "@stores": "<rootDir>/src/stores",
        "@utils": "<rootDir>/src/utils",
    },
};
