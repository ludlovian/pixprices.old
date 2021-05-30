import { unlink, writeFile } from 'fs/promises'

import log from 'logjs'
import sortBy from 'sortby'
import { upload } from 'googlejs/storage'

const debug = log
  .prefix('export-stocks:')
  .colour()
  .level(2)

const STOCKS_URI = 'gs://finance-readersludlow/stocks.csv'
const TEMPFILE = '/tmp/stocks.csv'

export async function exportStocks ({ stocks }) {
  const data = [...stocks.values()]
    .sort(sortBy('ticker'))
    .map(stockToRow)
    .map(makeCSV)
    .join('')

  await writeFile(TEMPFILE, data)
  await upload(TEMPFILE, STOCKS_URI, { acl: 'public' })
  await unlink(TEMPFILE)
  debug('stocks written to %s', STOCKS_URI)
}

function stockToRow (row) {
  const { ticker, incomeType, name, price, dividend, notes } = row
  return [ticker, incomeType, name, price || 0, dividend || 0, notes]
}

function makeCSV (arr) {
  return (
    arr
      .map(v => {
        if (typeof v === 'number') return v.toString()
        if (v == null) return ''
        return '"' + v.toString().replaceAll('"', '""') + '"'
      })
      .join(',') + '\n'
  )
}
