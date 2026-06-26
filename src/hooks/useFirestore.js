// Realtime Firestore hooks (onSnapshot) + one-shot fetch helper.
import { useEffect, useState } from 'react'
import { doc, onSnapshot, collection, query as fsQuery, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

/** Stream a single document. path null disables. */
export function useDoc(path) {
  const [state, setState] = useState({ data: null, loading: true, error: null, exists: false })
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null, exists: false })
      return undefined
    }
    const ref = doc(db, ...path.split('/'))
    return onSnapshot(
      ref,
      (snap) =>
        setState({
          data: snap.exists() ? { id: snap.id, ...snap.data() } : null,
          loading: false,
          error: null,
          exists: snap.exists(),
        }),
      (error) => setState({ data: null, loading: false, error, exists: false })
    )
  }, [path])
  return state
}

/**
 * Stream a collection with constraints.
 * @param {string|null} path
 * @param {Array} constraints  firestore where/orderBy/limit
 * @param {string} depKey      stable string that changes when constraints change
 */
export function useCollection(path, constraints = [], depKey = '') {
  const [state, setState] = useState({ data: [], loading: true, error: null })
  useEffect(() => {
    if (!path) {
      setState({ data: [], loading: false, error: null })
      return undefined
    }
    const ref = collection(db, ...path.split('/'))
    const q = constraints.length ? fsQuery(ref, ...constraints) : ref
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, depKey])
  return state
}

/** One-shot fetch for reports. */
export async function fetchCollection(path, constraints = []) {
  const ref = collection(db, ...path.split('/'))
  const q = constraints.length ? fsQuery(ref, ...constraints) : ref
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
