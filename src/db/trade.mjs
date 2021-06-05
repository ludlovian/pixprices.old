import sortBy from 'sortby'

import PortfolioTable from './table.mjs'
import { readDecimal, readDate, writeDecimal, clean } from './util.mjs'

export default class Trades extends PortfolioTable {
  constructor () {
    super('Trade', Trade, x => `${x.who}_${x.account}_${x.ticker}_${x.seq}`)
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
      .thenBy('seq')

    this.addIndex('position', x => `${x.who}_${x.account}_${x.ticker}`)
  }

  getTrades (data) {
    return this.get(data, 'position')
  }

  setTrades (data) {
    const old = this.get(data[0], 'position')
    let seq = 1
    const updated = new Set()
    for (const trade of data) {
      const row = this.set({ ...trade, seq })
      updated.add(row)
      old.delete(row)
      seq++
    }
    for (const row of old) this.delete(row)
    return updated
  }
}

class Trade {
  deserialize (data) {
    const { cost, gain, qty, date, ...rest } = data
    Object.assign(this, {
      ...rest,
      date: readDate(date),
      qty: readDecimal(qty, 0),
      cost: readDecimal(cost, 2),
      gain: readDecimal(gain, 2)
    })
  }

  serialize () {
    const { qty, cost, gain } = this
    return clean({
      ...this,
      qty: writeDecimal(qty),
      cost: writeDecimal(cost),
      gain: writeDecimal(gain)
    })
  }
}
