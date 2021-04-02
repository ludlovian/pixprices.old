'use strict'

import sade from 'sade'

import { version } from '../package.json'

import { fetchIndex, fetchSector, fetchPrice } from './fetch-lse'
import { purgeOldPrices, writePrices } from './db'
import { publishPrices } from './publish'
import { wrap, toArr } from './util'

const prog = sade('pixprices')

prog.version(version)

prog
  .command('fetch', 'fetch prices')
  .option('--index', 'index to fetch')
  .option('--sector', 'sector to fetch')
  .option('--stock', 'stock to fetch')
  .option('--database', 'database name', 'prices.db')
  .option('--tempfile', 'transfer temp file', '/tmp/prices.json')
  .option(
    '--s3file',
    'publish destination',
    's3://finance-readersludlow/public/prices'
  )
  .option('--purge', 'purge period')
  .option('--publish', 'publish current prices')
  .action(wrap(fetchPrices))

prog.parse(process.argv, {
  string: ['purge'],
  boolean: ['publish']
})

async function fetchPrices (options) {
  const { index, sector, stock, purge, publish } = options
  const items = []
  for (const name of toArr(index)) {
    items.push(...(await fetchIndex(name)))
  }

  for (const name of toArr(sector)) {
    items.push(...(await fetchSector(name)))
  }

  for (const name of toArr(stock)) {
    items.push(await fetchPrice(name))
  }

  if (items.length) {
    await writePrices(items, options)
  }

  if (purge) {
    await purgeOldPrices(purge, options)
  }

  if (publish) {
    await publishPrices(options)
  }
}
