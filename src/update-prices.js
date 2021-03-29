'use strict'

import fs from 'fs'

import Debug from 'debug'

import * as lse from './fetch-lse'
import * as s3js from 's3js'

const debug = Debug('pixprices:update-prices')

export async function updatePrices ({
  temp: tempFile,
  prices: pricesFile,
  'purge-after': purgeDays
} = {}) {
  debug('fetching prices from LSE')

  const updates = await lse.fetchAll()

  debug('Updating %s', pricesFile)
  await s3js.download(pricesFile, tempFile)
  const prices = JSON.parse(fs.readFileSync(tempFile, 'utf8'))

  for (const update of Object.values(updates)) {
    prices[update.code] = Object.assign(prices[update.code] || {}, update)
  }

  const purgeBefore = Date.now() - purgeDays * 24 * 60 * 60 * 1000

  const purged = []
  for (const item of Array.from(Object.values(prices))) {
    if (!item.time || item.time < purgeBefore) {
      purged.push(item.code)
      delete prices[item.code]
    }
  }

  fs.writeFileSync(tempFile, JSON.stringify(prices))
  await s3js.upload(tempFile, pricesFile)

  fs.unlinkSync(tempFile)

  debug('%d updates applied', Object.values(updates).length)
  if (purged.length) {
    debug('Items purged: %s', purged.join(','))
  }
}
