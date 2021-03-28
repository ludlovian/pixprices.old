import { terser } from 'rollup-plugin-terser'
import cleanup from 'rollup-plugin-cleanup'
import json from 'rollup-plugin-json'
import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'

export default {
  input: 'src/main.js',
  external: [
    's3js',
    'fs',
    'sade',
    'httpie',
    'cheerio',
    'debug'
  ],
  plugins: [
    resolve({ preferBuiltins: true }),
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
