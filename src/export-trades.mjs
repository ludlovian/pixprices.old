import log from 'logjs'
import sortBy from 'sortby'

import { updateTradesSheet } from './sheets.mjs'

const debug = log
  .prefix('export-trades:')
  .colour()
  .level(2)

export async function exportTrades (portfolio) {
  updateTradesSheet(getTradesSheet(portfolio))
  debug('trades sheet updated')
}

function getTradesSheet ({ trades }) {
  let source = trades.values()
  source = sortTrades(source)
  source = makeRows(source)
  return [...source]
}

function * sortTrades (source) {
  const fn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq')
  const rows = [...source]
  rows.sort(fn)
  yield * rows
}

function * makeRows (source) {
  for (const trade of source) {
    const { who, account, ticker, date, qty, cost, gain } = trade
    yield [
      who,
      account,
      ticker,
      date,
      qty || '',
      cost ? cost / 100 : '',
      gain ? gain / 100 : ''
    ]
  }
}
