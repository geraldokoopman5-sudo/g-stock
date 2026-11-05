import { useSyncExternalStore } from 'react'
import { getTheme, subscribeToTheme } from '../theme'

export function useTheme() {
  return useSyncExternalStore(subscribeToTheme, getTheme, () => 'light' as const)
}
