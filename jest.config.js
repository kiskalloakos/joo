// Scoped to pure logic in lib/ only. These modules have no React Native or
// Supabase imports, so a plain ts-jest/node setup is enough — no jest-expo /
// RN mocking required. Component tests, if ever added, would need a separate
// jest-expo project.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/lib/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/\\._'],
};
