import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../firebase'

/** Upload a File/Blob and return its download URL. */
export async function uploadFile(path, file) {
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

/** Build a deterministic-ish storage path for a customer asset. */
export function customerAssetPath(kind, fileName) {
  const safe = String(fileName || 'file').replace(/[^\w.-]/g, '_')
  return `customers/${kind}/${Date.now()}-${safe}`
}
