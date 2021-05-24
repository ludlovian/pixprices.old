import log from 'logjs'
import sortBy from 'sortby'
import teme from 'teme'
import { updateTradesSheet } from './sheets.mjs'

const debug = log
  .prefix('export-trades:')
  .colour()
  .level(2)

export async function exportTrades (portfolio) {
  await updateTradesSheet(getTradesSheet(portfolio))
  debug('trades sheet updated')
}

function getTradesSheet ({ trades }) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq')

  return teme(trades.values())
    .sort(sortFn)
    .map(makeTradeRow)
    .collect()
}

function makeTradeRow ({ who, account, ticker, date, qty, cost, gain }) {
  return [
    who,
    account,
    ticker,
    date,
    qty || 0,
    cost ? cost / 100 : 0,
    gain ? gain / 100 : 0
  ]
}
