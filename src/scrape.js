;(async () => {
  // eslint-disable-next-line no-undef
  const context = { CONTEXT }
  // eslint-disable-next-line no-undef
  const location = window.location
  const href = location.href
  if (context.url !== href) return
  const { server, controller } = context

  //
  // Page loading
  //

  const domLoaded = new Promise(resolve => {
    const okStates = ['interactive', 'complete']
    const ready = () => okStates.includes(document.readyState)
    if (ready()) return resolve()
    document.addEventListener('readystatechange', () => ready() && resolve())
  })

  //
  // Scraping
  //

  const tableSelector = 'table.sp-constituents__table,table.sp-sectors__table'

  const rgxNameAndTicker = /^(.*) \((\w+)\.*\)$/
  const rgxNumber = /^[\d.,]+$/

  function getTable () {
    const table = document.querySelector(tableSelector)
    if (!table) throw new Error('Could not find table')

    function getNameAndTicker (txt) {
      if (!txt) return
      const m = rgxNameAndTicker.exec(txt)
      return m ? [m[1], m[2]] : undefined
    }

    function getPrice (txt) {
      if (!txt || !rgxNumber.test(txt)) return
      return Number(txt.replaceAll(',', ''))
    }

    function processRow (row) {
      const cells = [...row.querySelectorAll('td')].map(c => c.textContent)
      const [name, ticker] = getNameAndTicker(cells[0]) || []
      const price = getPrice(cells[1])
      if (!name || !ticker || price == null) return
      return { name, ticker, price }
    }

    return [...table.querySelectorAll('tr')].map(processRow).filter(Boolean)
  }

  async function scrape () {
    const prices = getTable()
    if (!prices.length) return
    const body = JSON.stringify(prices)
    await fetch(server, { method: 'POST', body })
  }

  await domLoaded
  try {
    await scrape()
    window.stop()
    location.assign(controller)
  } catch (e) {
    console.log(e)
  }
})()
