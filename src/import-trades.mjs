import log from 'logjs'
import { toDate } from 'googlejs/sheets'
import sortBy from 'sortby'
import teme from 'teme'
import pipeline from 'pixutil/pipeline'

import { getTradesSheet } from './sheets.mjs'

const debug = log
  .prefix('import-trades:')
  .colour()
  .level(2)

export async function importFromTradesSheet ({ trades }) {
  const rangeData = await getTradesSheet()

  let nGroups = 0
  let nTrades = 0

  for (const group of getTradeGroups(rangeData)) {
    if (!group.length) continue
    nGroups++
    nTrades += group.length
    trades.setTrades(group)
  }

  debug('Updated %d positions with %d trades', nGroups, nTrades)
}

function getTradeGroups (rows) {
  return pipeline(teme(rows), readTrades, sortTrades, groupTrades, addCosts)
}

function readTrades (rows) {
  return rows
    .map(rowToTrade())
    .filter(validTrade)
    .map(cleanTrade)
}

function rowToTrade () {
  const account = 'Dealing'
  let who
  let ticker
  return ([who_, ticker_, date, qty, cost, notes]) => {
    who = who_ || who
    ticker = ticker_ || ticker
    return { who, account, ticker, date, qty, cost, notes }
  }
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

function sortTrades (trades) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq')

  let seq = 0

  return trades
    .map(trade => ({ ...trade, seq: seq++ }))
    .sort(sortFn)
    .map(({ seq, ...trade }) => trade)
}

function groupTrades (trades) {
  return trades
    .group(({ who, account, ticker }) => ({ who, account, ticker }))
    .map(([, group]) => group)
}

function addCosts (groups) {
  return groups.map(group => group.each(buildPosition()).collect())
}

function buildPosition () {
  const pos = { qty: 0, cost: 0 }
  return trade => {
    const { qty, cost } = trade
    if (qty && cost && qty > 0) {
      // buy
      pos.qty += qty
      pos.cost += cost
    } else if (qty && cost && qty < 0) {
      const prev = { ...pos }
      const proceeds = -cost
      pos.qty += qty
      const remain = prev.qty ? pos.qty / prev.qty : 0
      pos.cost = Math.round(remain * prev.cost)
      trade.cost = pos.cost - prev.cost
      trade.gain = proceeds + trade.cost
    } else if (qty) {
      pos.qty += qty
    } else if (cost) {
      pos.cost += cost
    }
  }
}
