import log from 'logjs'

import { getSheetData } from '../sheets.mjs'

const debug = log
  .prefix('import:stocks:')
  .colour()
  .level(2)

const source = {
  name: 'Stocks',
  range: 'Stocks!A:D'
}

export default async function importStocks ({ stocks }) {
  const rows = await getSheetData(source.name, source.range)

  const attrs = rows.shift()
  const validRow = row => !!row[0]
  const rowAttribs = row => attrs.map((k, ix) => [k, row[ix]])
  const validAttribs = kvs => kvs.filter(([k]) => !!k)
  const makeObject = kvs => Object.fromEntries(kvs)

  const data = rows
    .filter(validRow)
    .map(rowAttribs)
    .map(validAttribs)
    .map(makeObject)

  for (const stock of data) {
    stocks.set(stock)
  }

  debug('Loaded %d records from stocks', data.length)
}
