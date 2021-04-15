import { terser } from 'rollup-plugin-terser'
import cleanup from 'rollup-plugin-cleanup'
import json from '@rollup/plugin-json'
import commonjs from '@rollup/plugin-commonjs'

export default {
  input: 'src/main.js',
  external: [
    'fs/promises',
    'sade',
    'httpie',
    'cheerio',
    'debug',
    'ms',
    'jsdbd',
    '@googleapis/sheets',
    '@googleapis/drive'
  ],
  plugins: [
    commonjs(),
    json(),
    cleanup(),
    process.env.NODE_ENV === 'production' && terser()
  ],
  output: [
    {
      file: 'dist/pixprices',
      format: 'cjs',
      sourcemap: false,
      banner: '#!/usr/bin/env node'
    }
  ]
}
