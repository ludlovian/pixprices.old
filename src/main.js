'use strict'

import sade from 'sade'

import { version } from '../package.json'

import { fetchIndex, fetchSector, fetchPrice } from './fetch-lse'
import { purgeOldPrices } from './db'
import { publishPrices } from './publish'

const prog = sade('pixprices')

prog.version(version).option('--database', 'database name', 'prices.db')

prog.command('fetch lse index <index>', 'fetch index prices').action(fetchIndex)

prog
  .command('fetch lse sector <sector>', 'fetch sector prices')
  .action(fetchSector)

prog.command('fetch lse price <code>', 'fetch stock price').action(fetchPrice)

prog
  .command('purge prices after <time>', 'purge old prices')
  .action(purgeOldPrices)

prog
  .command('publish', 'publish prices to S3')
  .option('--tempfile', 'transfer temp file', '/tmp/prices.json')
  .option(
    '--s3file',
    'publish destination',
    's3://finance-readersludlow/public/prices'
  )
  .action(publishPrices)

const parsed = prog.parse(process.argv, { lazy: true })
if (parsed) {
  const { handler, args } = parsed
  handler(...args).catch(err => {
    console.error(err)
    process.exit(1)
  })
}
