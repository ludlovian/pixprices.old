import log from 'logjs'
import sortBy from 'sortby'
import { pipeline, filter, sort, map } from 'teme'

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
  const { stocks, positions } = portfolio

  const hasQty = pos => !!pos.qty
  const addStock = position => ({
    position,
    stock: stocks.get(position.ticker)
  })
  const sortFn = sortBy('ticker')
    .thenBy('who')
    .thenBy('account')
  const makeRow = ({ position: p, stock: s }) => [
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

  const xform = pipeline(
    filter(hasQty),
    sort(sortFn),
    map(addStock),
    map(makeRow)
  )

  return [...xform(positions.values())]
}
