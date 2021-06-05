import log from 'logjs'

import { getSheetData } from '../sheets.mjs'
import { importDecimal } from './util.mjs'

const debug = log
  .prefix('import:portfolio:')
  .colour()
  .level(2)

const SOURCE = {
  name: 'Portfolio',
  range: 'Investments!A:AM'
}

const TICKER_COLUMN = 10 // column K
const ACCOUNT_COLUMN = 0 // column A
const ACCOUNT_LIST =
  'AJL,ISA;RSGG,ISA;AJL,Dealing;RSGG,Dealing;AJL,SIPP;RSGG,SIPP;RSGG,SIPP2'
const DIV_COLUMN = 26 // column AA

export default async function importPortfolio ({ stocks, positions }) {
  const rangeData = await getSheetData(SOURCE.name, SOURCE.range)

  updateDividends(stocks, rangeData)
  updatePositions(positions, rangeData)
}

function updateDividends (stocks, rangeData) {
  const notSeen = new Set(stocks.all())
  let count = 0
  for (const item of getDividendData(rangeData)) {
    const stock = stocks.set(item)
    notSeen.delete(stock)
    count++
  }
  notSeen.forEach(clearDividend)
  debug(
    'Updated %d and cleared %d dividends from portfolio sheet',
    count,
    notSeen.size
  )

  function clearDividend ({ ticker }) {
    stocks.set({ ticker, dividend: undefined })
  }
}

function getDividendData (rangeData) {
  const extractData = row => [row[TICKER_COLUMN], row[DIV_COLUMN]]
  const validTicker = ([ticker]) => !!ticker
  const makeObj = ([ticker, dividend]) => ({
    ticker,
    dividend: importDecimal(dividend)
  })

  return rangeData
    .map(extractData)
    .filter(validTicker)
    .map(makeObj)
}

function updatePositions (positions, rangeData) {
  const notSeen = new Set(positions.all())
  let count = 0
  for (const item of getPositionData(rangeData)) {
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

function * getPositionData (rangeData) {
  const accts = ACCOUNT_LIST.split(';')
    .map(code => code.split(','))
    .map(([who, account]) => ({ who, account }))

  const extractRow = row => [
    row[TICKER_COLUMN],
    accts,
    row.slice(ACCOUNT_COLUMN, ACCOUNT_COLUMN + accts.length)
  ]
  const validRow = ([ticker]) => !!ticker

  const rows = rangeData.map(extractRow).filter(validRow)

  for (const [ticker, accts, qtys] of rows) {
    yield * getPositionsFromRow(ticker, accts, qtys)
  }
}

function * getPositionsFromRow (ticker, accts, qtys) {
  const makePos = (qty, i) => ({
    ticker,
    ...accts[i],
    qty: importDecimal(qty, 0)
  })
  const validPos = x => !!x.qty

  const positions = qtys.map(makePos).filter(validPos)

  yield * positions
}
