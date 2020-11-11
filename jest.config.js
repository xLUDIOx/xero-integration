/** @typedef {import('ts-jest')} */
/** @type {import('@jest/types').Config.InitialOptions} */

process.env.CI = true;

module.exports = {
    "preset": "ts-jest",
    "testMatch": [
        "**/src/**/*.spec.ts",
    ],
    "coverageThreshold": {
        // should strive for better results in the future
        "global": {
            "branches": 12,
            "functions": 21,
            "lines": 37,
        },
    },
    "slowTestThreshold": 1, // seconds
    // "verbose": true, // uncomment for detailed test run info
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
        "@managers": "<rootDir>/src/managers",
        "@services": "<rootDir>/src/services",
        "@shared": "<rootDir>/src/shared",
        "@stores": "<rootDir>/src/stores",
        "@utils": "<rootDir>/src/utils",
    },
};
