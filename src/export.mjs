import { updatePositionsSheet } from './sheets.mjs'

export async function exportPositions (portfolio) {
  return updatePositionsSheet(getPositionsSheet(portfolio))
}

function getPositionsSheet (portfolio) {
  const rows = []

  for (const { stock, position } of getPositions(portfolio)) {
    rows.push(makePositionRow({ stock, position }))
  }

  rows.sort((x, y) => {
    if (x[0] < y[0]) return -1
    if (x[0] > y[0]) return 1
    if (x[1] < y[1]) return -1
    if (x[1] > y[1]) return 1
    if (x[2] < y[2]) return -1
    if (x[2] > y[2]) return 1
    return 0
  })

  return rows
}

function * getPositions ({ positions, stocks }) {
  for (const position of positions.values()) {
    if (!position.qty) continue
    const stock = stocks.get({ ticker: position.ticker })
    yield { stock, position }
  }
}

function makePositionRow ({ position, stock }) {
  const { who, account, ticker, qty } = position
  const { dividend, price } = stock
  return [
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
