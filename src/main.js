'use strict'

import sade from 'sade'

import { version } from '../package.json'

import { wrap } from './util'
import { updatePrices } from './update-prices'

const prog = sade('pixprices')

prog.version(version)

prog
  .command('fetch lse', 'fetch prices from lse')
  .option(
    '--prices',
    's3 resource for prices',
    's3://finance-readersludlow/public/prices'
  )
  .option('--temp', 'temp file for downloads', '/tmp/lse.json')
  .option('--purge-after', 'purge after days of non-update', 7)
  .action(wrap(updatePrices))

prog.parse(process.argv)
