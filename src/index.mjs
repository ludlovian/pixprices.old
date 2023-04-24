import Server from './server.mjs'
import PriceStore from './prices.mjs'

async function main () {
  const host = process.argv.includes('client2') ? 'client2' : 'localhost'
  const store = new PriceStore()
  await store.load()

  const server = new Server(host, store)
  await server.start()
}

main().catch(e => {
  console.log(e)
  process.exit(1)
})
