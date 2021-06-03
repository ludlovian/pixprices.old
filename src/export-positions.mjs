import log from 'logjs'
import sortBy from 'sortby'
import teme from 'teme'
import decimal from 'decimal'

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
  const _yield =
    s.price && s.dividend
      ? decimal(s.dividend.number / s.price.number).precision(3).number
      : 0
  const value = p.qty && s.price ? s.price.mul(p.qty).precision(2).number : 0
  const income =
    p.qty && s.dividend ? s.dividend.mul(p.qty).precision(2).number : 0
  return [
    p.ticker,
    p.who,
    p.account,
    p.qty ? p.qty.number : 0,
    s.price ? s.price.number : 0,
    s.dividend ? s.dividend.number : 0,
    _yield,
    value,
    income
  ]
}
