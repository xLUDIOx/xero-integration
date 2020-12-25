/** @typedef {import('ts-jest')} */
/** @type {import('@jest/types').Config.InitialOptions} */

process.env.TESTING = 'true';

module.exports = {
    "preset": "ts-jest",
    "testMatch": [
        "**/src/**/*.spec.ts",
    ],
    /* This should be an effort on itself at this point
    "coverageThreshold": {
        // should strive for better results in the future
        "global": {
            "branches": 35,
            "functions": 40,
            "lines": 51,
        },
    },
    */
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
        "@environment": "<rootDir>/src/environment",
        "@managers": "<rootDir>/src/managers",
        "@services": "<rootDir>/src/services",
        "@shared": "<rootDir>/src/shared",
        "@stores": "<rootDir>/src/stores",
        "@utils": "<rootDir>/src/utils",
    },
};
