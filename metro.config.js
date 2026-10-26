const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// This project lives on an external drive that can create macOS AppleDouble
// sidecars (`._filename`) beside source files. They are binary metadata, not
// JavaScript modules, and must never be considered by Metro / Expo Router.
config.resolver.blockList = /.*\/\._[^/]*$/;

module.exports = config;
