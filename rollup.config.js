import resolve from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'

export default {
  input: 'src/main.mjs',
  external: [
    'sade',
    'httpie',
    'cheerio',
    'debug',
    'ms',
    '@googleapis/sheets',
    '@googleapis/drive'
  ],
  plugins: [
    resolve(),
    replace({
      preventAssignment: true,
      values: {
        __VERSION__: process.env.npm_package_version
      }
    })
  ],
  output: [
    {
      file: 'dist/pixprices.mjs',
      format: 'esm',
      sourcemap: false,
      banner: '#!/usr/bin/env node'
    }
  ]
}
