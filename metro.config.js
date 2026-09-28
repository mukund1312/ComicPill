const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle's expo-sqlite migrator imports raw .sql files.
config.resolver.sourceExts.push('sql');

module.exports = config;
