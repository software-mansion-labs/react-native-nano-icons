module.exports = {
  overrides: [
    {
      exclude: /\/node_modules\//,
      presets: ['module:react-native-builder-bob/babel-preset'],
    },
    {
      include: /\/node_modules\//,
      presets: ['module:@react-native/babel-preset'],
      plugins: [
        '@babel/plugin-transform-export-namespace-from',
        '@babel/plugin-transform-dynamic-import',
        '@babel/plugin-transform-class-static-block',
        '@babel/plugin-transform-explicit-resource-management',
      ],
    },
  ],
};
