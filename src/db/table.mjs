import { Table as Store } from 'googlejs/datastore'
import MemTable from 'memdb'

export default class PortfolioTable extends MemTable {
  constructor (kind, factory, main) {
    super({ factory, main })
    this.kind = kind
    this.store = new Store(kind)
  }

  async load () {
    const rows = await this.store.select({ factory: this.factory })
    super.load(rows.sort(this.order))
  }

  onsave (updated, deleted) {
    return Promise.all([
      this.store.upsert([...updated]),
      this.store.delete([...deleted])
    ])
  }

  set (data) {
    return this.upsert(data)
  }
}
