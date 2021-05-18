import log from 'logjs'

import { getPortfolioSheet } from './sheets.mjs'

const debug = log
  .prefix('import-portfolio:')
  .colour()
  .level(2)

const DEFAULT_TICKER_COLUMN = 10 // column K
const DEFAULT_ACCOUNT_COLUMN = 0 // column A
const DEFAULT_ACCOUNT_LIST =
  'AJL,ISA;RSGG,ISA;AJL,Dealing;RSGG,Dealing;AJL,SIPP;RSGG,SIPP;RSGG,SIPP2'
const DEFAULT_DIV_COLUMN = 26 // column AA

export async function importFromPortfolioSheet (portfolio) {
  const rangeData = await getPortfolioSheet()

  updateStocks(portfolio.stocks, rangeData)
  updatePositions(portfolio.positions, rangeData)
}

function updateStocks (stocks, rangeData, options) {
  const notSeen = new Set(stocks.values())
  let count = 0
  for (const item of getStockData(rangeData, options)) {
    const stock = stocks.set(item)
    notSeen.delete(stock)
    count++
  }
  notSeen.forEach(clearDividend)
  debug(
    'Updated %d and removed %d dividends from portfolio sheet',
    count,
    notSeen.size
  )

  function clearDividend ({ ticker }) {
    stocks.set({ ticker, dividend: undefined })
  }
}

function * getStockData (rangeData, options = {}) {
  const {
    tickerColumn = DEFAULT_TICKER_COLUMN,
    divColumn = DEFAULT_DIV_COLUMN
  } = options

  for (const row of rangeData) {
    const ticker = row[tickerColumn]
    if (!ticker) continue
    const div = row[divColumn]
    const item = {
      ticker,
      dividend:
        div && typeof div === 'number' ? Math.round(div * 1e5) / 1e3 : undefined
    }
    yield item
  }
}

function updatePositions (positions, rangeData, options) {
  const notSeen = new Set(positions.values())
  let count = 0
  for (const item of getPositionData(rangeData, options)) {
    const position = positions.set(item)
    notSeen.delete(position)
    count++
  }
  notSeen.forEach(position => positions.delete(position))
  debug(
    'Updated %d and removed %d positions from portfolio sheet',
    count,
    notSeen.size
  )
}

function * getPositionData (rangeData, options = {}) {
  const {
    tickerCol = DEFAULT_TICKER_COLUMN,
    accountCol = DEFAULT_ACCOUNT_COLUMN,
    accounts = DEFAULT_ACCOUNT_LIST
  } = options

  const accts = accounts
    .split(';')
    .map(code => code.split(','))
    .map(([who, account]) => ({ who, account }))

  for (const row of rangeData) {
    const ticker = row[tickerCol]
    if (!ticker) continue

    const positions = row
      .slice(accountCol, accountCol + accts.length)
      .map((qty, i) => ({ ...accts[i], ticker, qty }))
      .filter(({ qty }) => qty && typeof qty === 'number')

    yield * positions
  }
}
