import Stocks from './db/stock.mjs'
import Positions from './db/position.mjs'
import Trades from './db/trade.mjs'
import importStocks from './import/stocks.mjs'
import importPortfolio from './import/portfolio.mjs'
import importTrades from './import/trades.mjs'
import fetchPrices from './fetch/prices.mjs'
import exportPositions from './export/positions.mjs'
import exportTrades from './export/trades.mjs'
import exportStocks from './export/stocks.mjs'

export default class Portfolio {
  constructor () {
    this.stocks = new Stocks()
    this.positions = new Positions()
    this.trades = new Trades()
  }

  async load () {
    await Promise.all([
      this.stocks.load(),
      this.positions.load(),
      this.trades.load()
    ])
  }

  async save () {
    await Promise.all([
      this.stocks.save(),
      this.positions.save(),
      this.trades.save()
    ])
  }

  importStocks () {
    return importStocks(this)
  }

  importPortfolio () {
    return importPortfolio(this)
  }

  importTrades () {
    return importTrades(this)
  }

  fetchPrices () {
    return fetchPrices(this)
  }

  exportPositions () {
    return exportPositions(this)
  }

  exportTrades () {
    return exportTrades(this)
  }

  exportStocks () {
    return exportStocks(this)
  }
}
