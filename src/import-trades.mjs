import log from 'logjs'
import { toDate } from 'googlejs/sheets'
import sortBy from 'sortby'
import teme from 'teme'
import pipeline from 'pixutil/pipeline'

import { getTradesSheet } from './sheets.mjs'
import { maybeDecimal } from './util.mjs'
import decimal from './decimal.mjs'

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
  return rows.map(rowToTrade()).filter(validTrade)
}

function rowToTrade () {
  const account = 'Dealing'
  let who
  let ticker
  return ([who_, ticker_, date, qty, cost, notes]) => ({
    who: (who = who_ || who),
    account,
    ticker: (ticker = ticker_ || ticker),
    date: maybeDate(date),
    qty: maybeDecimal(qty, 0),
    cost: maybeDecimal(cost, 2),
    notes
  })
}

function maybeDate (x) {
  return typeof x === 'number' ? toDate(x) : undefined
}

function validTrade ({ who, ticker, date, qty, cost }) {
  return who && ticker && date && (qty || cost)
}

function sortTrades (trades) {
  const sortFn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('date')
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
  const pos = { qty: decimal(0), cost: decimal(0) }
  return trade => {
    const { qty, cost } = trade
    if (qty && cost && qty.number > 0) {
      // buy
      pos.qty = pos.qty.add(qty)
      pos.cost = pos.cost.add(cost)
    } else if (qty && cost && qty.number < 0) {
      const prev = { ...pos }
      const proceeds = cost.abs()
      pos.qty = pos.qty.add(qty)
      const remain = prev.qty.number ? pos.qty.number / prev.qty.number : 0
      pos.cost = prev.cost.mul(remain)
      trade.cost = prev.cost.sub(pos.cost).neg()
      trade.gain = proceeds.sub(trade.cost.abs())
    } else if (qty) {
      pos.qty = pos.qty.add(qty)
    } else if (cost) {
      pos.cost = pos.cost.add(cost)
    }
  }
}
