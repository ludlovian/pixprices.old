import Debug from 'debug'

import { getPortfolioSheet } from './sheets.mjs'

const debug = Debug('pixprices:import')

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
    const stock = stocks.get(item)
    notSeen.delete(stock)
    Object.assign(stock, item)
    count++
  }
  notSeen.forEach(stock => stocks.delete(stock))
  debug(
    'Updated %d and removed %d stocks from portfolio sheet',
    count,
    notSeen.size
  )
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
    const item = { ticker }
    if (!div || typeof div !== 'number') {
      item.dividend = undefined
    } else {
      item.dividend = Math.round(div * 1e5) / 1e3
    }
    yield item
  }
}

function updatePositions (positions, rangeData, options) {
  const notSeen = new Set(positions.values())
  let count = 0
  for (const item of getPositionData(rangeData, options)) {
    const position = positions.get(item)
    notSeen.delete(position)
    Object.assign(position, item)
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
    tickerColumn = DEFAULT_TICKER_COLUMN,
    accountStartColumn = DEFAULT_ACCOUNT_COLUMN,
    accountList = DEFAULT_ACCOUNT_LIST
  } = options

  const accounts = accountList.split(';').map(code => {
    const [who, account] = code.split(',')
    return { who, account }
  })

  for (const row of rangeData) {
    const ticker = row[tickerColumn]
    if (!ticker) continue

    const qtys = row.slice(
      accountStartColumn,
      accountStartColumn + accounts.length
    )
    for (const [i, qty] of qtys.entries()) {
      if (!qty || typeof qty !== 'number') continue

      yield { ...accounts[i], ticker, qty }
    }
  }
}
