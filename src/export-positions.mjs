import log from 'logjs'
import sortBy from 'sortby'

import { updatePositionsSheet } from './sheets.mjs'

const debug = log
  .prefix('export-positions:')
  .colour()
  .level(2)

export async function exportPositions (portfolio) {
  updatePositionsSheet(getPositionsSheet(portfolio))
  debug('position sheet updated')
}

function getPositionsSheet (portfolio) {
  const rows = positionRows(getPositions(portfolio))
  const fn = sortBy(0)
    .thenBy(1)
    .thenBy(2)
  return [...rows].sort(fn)
}

function * getPositions ({ positions, stocks }) {
  for (const position of positions.values()) {
    if (!position.qty) continue
    const stock = stocks.get(position.ticker)
    yield { stock, position }
  }
}

function * positionRows (source) {
  for (const { position, stock } of source) {
    const { who, account, ticker, qty } = position
    const { dividend, price } = stock
    yield [
      ticker,
      who,
      account,
      qty,
      price || '',
      dividend || '',
      dividend && price ? dividend / price : '',
      Math.round(qty * price) / 100 || '',
      dividend ? Math.round(qty * dividend) / 100 : ''
    ]
  }
}
