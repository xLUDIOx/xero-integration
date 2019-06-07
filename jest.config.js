module.exports = {
    "transform": {
        "^.+\\.tsx?$": "ts-jest"
    },
    "testMatch": [
        "**/src/**/*.spec.ts"
    ],
    "testPathIgnorePatterns": [
        "/node_modules/",
        "/integration-tests/"
    ],
    "collectCoverage": true,
    "collectCoverageFrom": [
        "src/**/*.ts"
    ],
    "moduleFileExtensions": [
        "ts",
        "tsx",
        "js",
        "jsx",
        "json",
        "node"
    ],
};
