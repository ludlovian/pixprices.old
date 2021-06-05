import Portfolio from './portfolio.mjs'

export async function update (options) {
  const portfolio = new Portfolio()
  await portfolio.load()

  if (options['import-portfolio']) {
    await portfolio.importPortfolio()
  }

  if (options['import-trades']) {
    await portfolio.importTrades()
  }

  if (options['import-stocks']) {
    await portfolio.importStocks()
  }

  if (options['fetch-prices']) {
    await portfolio.fetchPrices()
  }

  await portfolio.save()

  if (options['export-positions']) {
    await portfolio.exportPositions()
  }
  if (options['export-trades']) {
    await portfolio.exportTrades()
  }

  if (options['export-stocks']) {
    await portfolio.exportStocks()
  }
}
