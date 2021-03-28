'use strict'

import sade from 'sade'
import Debug from 'debug'
import fs from 'fs'

import { version } from '../package.json'

import { wrap } from './util'
import * as lse from './fetch-lse'
import * as s3js from 's3js'

const debug = Debug('pixprices:main')

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
  .action(wrap(updateFromLSE))

prog.parse(process.argv)

async function updateFromLSE ({ temp: tempFile, prices: pricesFile }) {
  debug('fetching prices from LSE')
  const updates = await lse.fetchAll()

  debug('Updating %s', pricesFile)
  await s3js.download(pricesFile, tempFile)
  const prices = JSON.parse(fs.readFileSync(tempFile, 'utf8'))

  for (const update of Object.values(updates)) {
    prices[update.code] = Object.assign(prices[update.code] || {}, update)
  }

  fs.writeFileSync(tempFile, JSON.stringify(prices))
  await s3js.upload(tempFile, pricesFile)

  fs.unlinkSync(tempFile)

  debug('%d updates applied', Object.values(updates).length)
}
