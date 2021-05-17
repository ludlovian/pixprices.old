import log from 'logjs'
import sortBy from 'sortby'
import teme from 'teme'

import { updatePositionsSheet } from './sheets.mjs'

const debug = log
  .prefix('export-positions:')
  .colour()
  .level(2)

export async function exportPositions (portfolio) {
  await updatePositionsSheet(getPositionsSheet(portfolio))
  debug('position sheet updated')
}

function getPositionsSheet ({ stocks, positions }) {
  const sortFn = sortBy('ticker')
    .thenBy('who')
    .thenBy('account')

  return teme(positions.values())
    .filter(({ qty }) => qty)
    .map(addStock(stocks))
    .sort(sortFn)
    .map(makePositionRow)
    .collect()
}

function addStock (stocks) {
  return position => ({
    position,
    stock: stocks.get(position.ticker)
  })
}

function makePositionRow ({ position: p, stock: s }) {
  return [
    p.ticker,
    p.who,
    p.account,
    p.qty,
    s.price || '',
    s.dividend || '',
    s.dividend && s.price ? s.dividend / s.price : '',
    Math.round(p.qty * s.price) / 100 || '',
    s.dividend ? Math.round(p.qty * s.dividend) / 100 : ''
  ]
}
