import clone from 'pixutil/clone'

export default function Store (initialValue = {}) {
  let _value = clone(initialValue)
  let _version = 1
  let _dispatching = false

  const subs = new Set()
  const acts = new Map()

  const getState = () => clone(_value)
  const getVersion = () => _version
  
  const subscribe = fn => {
    subs.add(fn)
    return () => unsubcribe(fn)
  }
  const unsubcribe = fn => subs.delete(fn)
  const action = (event, fn) => acts.set(event, fn)
  const dispatch = (event, data) => {
    if (_dispatching) return Promise.resolve().then(() => dispatch(event, data))
    const fn = acts.get(event)
    if (!fn) return
    const prev = getState()
    _dispatching = true
    _value = clone(fn(prev, data))
    _version++
    [...subs].forEach(fn => fn(getState(), prev, event))
    _dispatching = false
  }
  
  return { getState, getVersion, subscribe, unsubscribe, action, dispatch }
}