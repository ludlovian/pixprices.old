import log from 'logjs'
import sortBy from 'sortby'

import { exportDecimal, exportDate } from './util.mjs'
import { overwriteSheetData } from '../sheets.mjs'

const debug = log
  .prefix('export:trades:')
  .colour()
  .level(2)

const trades = { name: 'Positions', range: 'Trades!A2:G' }

export default async function exportTrades (portfolio) {
  const data = getTradesSheet(portfolio)

  await overwriteSheetData(trades.name, trades.range, data)
  debug('trades sheet updated')
}

function getTradesSheet ({ trades }) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq')

  return [...trades.all()].sort(sortFn).map(makeTradeRow)
}

function makeTradeRow (t) {
  return [
    t.who,
    t.account,
    t.ticker,
    exportDate(t.date),
    exportDecimal(t.qty),
    exportDecimal(t.cost),
    exportDecimal(t.gain)
  ]
}
