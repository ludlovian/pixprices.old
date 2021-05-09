import log from 'logjs'
import sortBy from 'sortby'
import { map, pipeline, sort } from 'teme'

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
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq')
  const makeRow = ({ who, account, ticker, date, qty, cost, gain }) => [
    who,
    account,
    ticker,
    date,
    qty || '',
    cost ? cost / 100 : '',
    gain ? gain / 100 : ''
  ]

  const xform = pipeline(sort(sortFn), map(makeRow))

  return [...xform(trades.values())]
}
