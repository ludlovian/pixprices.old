'use strict'

import sade from 'sade'

import Portfolio from './portfolio.mjs'
import { getPortfolioSheet, updatePositionsSheet } from './sheets.mjs'
import { wrap } from './util.mjs'

const version = '__VERSION__'

const prog = sade('pixprices')

prog.version(version)

prog
  .command('update', 'update data')
  .option('--get-portfolio', 'update from portfolio sheet')
  .option('--fetch-prices', 'fetch prices from LSE')
  .option('--update-positions', 'update positions sheet')
  .action(wrap(update))

prog.parse(process.argv)

async function update (options) {
  const portfolio = await Portfolio.deserialize()

  if (options['get-portfolio']) {
    const sheet = await getPortfolioSheet()
    portfolio.loadStocksFromSheet(sheet)
    portfolio.loadPositionsFromSheet(sheet)
  }

  if (options['fetch-prices']) {
    await portfolio.fetchPrices()
  }

  await portfolio.serialize()

  if (options['update-positions']) {
    await updatePositionsSheet(portfolio.getPositionsSheet())
  }
}
