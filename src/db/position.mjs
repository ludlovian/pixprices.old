import sortBy from 'sortby'

import PortfolioTable from './table.mjs'
import { readDecimal, writeDecimal, clean } from './util.mjs'

export default class Positions extends PortfolioTable {
  constructor () {
    super('Position', Position, x => `${x.ticker}_${x.who}_${x.account}`)
    this.order = sortBy('ticker')
      .thenBy('who')
      .thenBy('account')
  }
}

class Position {
  deserialize (data) {
    const { qty, ...rest } = data
    Object.assign(this, {
      ...rest,
      qty: readDecimal(qty, 0)
    })
  }

  serialize () {
    const { qty } = this
    return clean({ ...this, qty: writeDecimal(qty) })
  }
}
