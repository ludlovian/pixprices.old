import log from 'logjs'
import { toDate } from 'googlejs/sheets'
import sortBy from 'sortby'
import { pipeline, group, sort, filter, map } from 'teme'

import { getTradesSheet } from './sheets.mjs'

const debug = log
  .prefix('import-trades:')
  .colour()
  .level(2)

export async function importFromTradesSheet (portfolio) {
  const rangeData = await getTradesSheet()

  updateTrades(portfolio.trades, rangeData)
}

function updateTrades (trades, rangeData) {
  const groups = makeExtractor()(rangeData)

  let nGroups = 0
  let nTrades = 0

  for (const group of groups) {
    if (!group.length) continue
    nGroups++
    nTrades += group.length
    trades.setTrades(group)
  }

  debug('Updated %d positions with %d trades', nGroups, nTrades)
}

function makeExtractor () {
  let seq = 0
  const addSeq = trade => ({ ...trade, seq: seq++ })
  const removeSeq = ({ seq, ...trade }) => trade
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq')
  const groupFn = ({ who, account, ticker }) => ({ who, account, ticker })

  return pipeline(
    readTrades(),
    map(addSeq),
    sort(sortFn),
    map(removeSeq),
    group(groupFn),
    map(([key, trades]) => addCosts(trades))
  )
}

function addCosts (trades) {
  const pos = { cost: 0, qty: 0 }

  const isBuy = ({ qty, cost }) => qty && cost && qty > 0
  const isSell = ({ qty, cost }) => qty && cost && qty < 0
  const adjQty = trade => {
    pos.qty += trade.qty
    return trade
  }
  const adjCost = trade => {
    pos.cost += trade.cost
    return trade
  }
  const buy = trade => adjQty(adjCost(trade))
  const sell = trade => {
    const prev = { ...pos }
    const proceeds = -trade.cost
    pos.qty += trade.qty
    const portionLeft = prev.qty ? pos.qty / prev.qty : 0
    pos.cost = Math.round(portionLeft * prev.cost)
    trade.cost = pos.cost - prev.cost
    trade.gain = proceeds + trade.cost
    return trade
  }

  trades = trades.map(trade => {
    if (isBuy(trade)) return buy(trade)
    if (isSell(trade)) return sell(trade)
    if (trade.qty) return adjQty(trade)
    if (trade.cost) return adjCost(trade)
    return trade
  })
  return trades
}

function readTrades () {
  const account = 'Dealing'
  let who
  let ticker

  return pipeline(map(rowToTrade), filter(validTrade), map(cleanTrade))

  function rowToTrade ([who_, ticker_, date, qty, cost, notes]) {
    who = who_ || who
    ticker = ticker_ || ticker
    return { who, account, ticker, date, qty, cost, notes }
  }

  function validTrade ({ who, ticker, date, qty, cost }) {
    if (!who || !ticker || typeof date !== 'number') return false
    if (qty && typeof qty !== 'number') return false
    if (cost && typeof cost !== 'number') return false
    return qty || cost
  }

  function cleanTrade ({ date, cost, ...rest }) {
    return {
      ...rest,
      date: toDate(date),
      cost: cost ? Math.round(cost * 100) : cost
    }
  }
}
