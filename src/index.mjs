import Server from './server.mjs'
import PriceStore from './prices.mjs'
import Scheduler from './scheduler.mjs'

async function main () {
  const priceStore = new PriceStore()
  const scheduler = new Scheduler()
  const server = new Server({ priceStore, scheduler })
  await server.start()
}

main().catch(e => {
  console.log(e)
  process.exit(1)
})
