import log from 'logjs'
import { toDate } from 'googlejs/sheets'
import equal from 'pixutil/equal'
import sortBy from 'sortby'

import { getTradesSheet } from './sheets.mjs'

const debug = log
  .prefix('import-trades:')
  .colour()
  .level(2)

export async function importFromTradesSheet (portfolio) {
  const rangeData = await getTradesSheet()

  updateTrades(portfolio.trades, rangeData)
}

function updateTrades (trades, source) {
  source = rawTrades(source)
  source = sortTrades(source)
  source = groupTrades(source)
  source = addCosts(source)

  let nGroups = 0
  let nTrades = 0

  for (const group of source) {
    if (!group.length) continue
    nGroups++
    nTrades += group.length
    trades.setTrades(group)
  }

  debug('Updated %d positions with %d trades', nGroups, nTrades)
}

function * addCosts (source) {
  for (const trades of source) {
    const pos = { cost: 0, qty: 0 }
    for (const trade of trades) {
      if (trade.qty && trade.cost && trade.qty > 0) {
        pos.qty += trade.qty
        pos.cost += trade.cost
      } else if (trade.qty && trade.cost && trade.qty < 0) {
        const prevPos = { ...pos }
        pos.qty += trade.qty
        pos.cost = prevPos.qty
          ? Math.round((prevPos.cost * pos.qty) / prevPos.qty)
          : 0
        const proceeds = -trade.cost
        trade.cost = pos.cost - prevPos.cost
        trade.gain = proceeds + trade.cost
      } else if (trade.qty) {
        pos.qty += trade.qty
      } else if (trade.cost) {
        pos.cost += trade.cost
      }
    }
    yield trades
  }
}

function * groupTrades (source) {
  const getKey = ({ who, account, ticker }) => ({ who, account, ticker })
  let currkey
  let trades = []
  for (const trade of source) {
    const key = getKey(trade)
    if (!equal(key, currkey)) {
      if (trades.length) yield trades
      currkey = key
      trades = []
    }
    trades.push(trade)
  }
  if (trades.length) yield trades
}

function * sortTrades (source) {
  const trades = [...source]
  // add sequence to ensure stable sort
  trades.forEach((trade, seq) => Object.assign(trade, { seq }))
  const fn = sortBy('who')
    .thenBy('account')
    .thenBy('ticker')
    .thenBy('seq')
  trades.sort(fn)
  // strip sequence out
  for (const { seq, ...trade } of trades) {
    yield trade
  }
}

function * rawTrades (rows) {
  const account = 'Dealing'
  let who
  let ticker
  for (const row of rows) {
    const [who_, ticker_, date_, qty, cost, notes] = row
    if (who_) who = who_
    if (ticker_) ticker = ticker_
    if (typeof date_ !== 'number') continue
    if (qty && typeof qty !== 'number') continue
    if (cost && typeof cost !== 'number') continue
    if (!qty && !cost) continue
    const date = toDate(date_)
    yield clean({
      who,
      ticker,
      account,
      date,
      qty,
      cost: Math.round(cost * 100),
      notes
    })
  }
}

function clean (obj) {
  const ret = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) ret[k] = v
  }
  return ret
}
