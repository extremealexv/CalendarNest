const webpack = require('webpack');

module.exports = function override(config, env) {
  // Add fallbacks for node core modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "util": require.resolve("util/"),
    "url": require.resolve("url/"),
    "assert": require.resolve("assert/"),
    "stream": require.resolve("stream-browserify"),
    "http": require.resolve("stream-http"),
    "https": require.resolve("https-browserify"),
    "os": require.resolve("os-browserify/browser"),
    "crypto": require.resolve("crypto-browserify"),
    "buffer": require.resolve("buffer/"),
    "path": require.resolve("path-browserify"),
    "zlib": require.resolve("browserify-zlib"),
  };

  // Add buffer plugin
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  return config;
};