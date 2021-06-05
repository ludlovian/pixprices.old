import sortBy from 'sortby'

import PortfolioTable from './table.mjs'
import { readDecimal, writeDecimal, clean } from './util.mjs'

export default class Stocks extends PortfolioTable {
  constructor () {
    super('Stock', Stock, x => x.ticker)
    this.order = sortBy('ticker')
  }
}

class Stock {
  deserialize (data) {
    const { price, dividend, ...rest } = data
    Object.assign(this, {
      ...rest,
      price: readDecimal(price),
      dividend: readDecimal(dividend)
    })
  }

  serialize () {
    return clean({
      ...this,
      price: writeDecimal(this.price),
      dividend: writeDecimal(this.dividend)
    })
  }
}
