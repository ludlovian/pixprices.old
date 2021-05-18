import log from 'logjs'

import { getStocksSheet } from './sheets.mjs'

const debug = log
  .prefix('import-stocks:')
  .colour()
  .level(2)

export async function importFromStocksSheet ({ stocks }) {
  const rows = await getStocksSheet()
  const attrs = rows.shift()

  const data = rows
    .filter(([x]) => x)
    .map(row => row.reduce((o, v, i) => ({ ...o, [attrs[i]]: v }), {}))

  for (const stock of data) {
    stocks.set(stock)
  }

  debug('Loaded %d records from stocks', data.length)
}
