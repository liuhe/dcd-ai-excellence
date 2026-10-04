import { createContext, useContext } from 'react'

export type Navigate = (id: string, isNode: boolean) => void
export const NavCtx = createContext<Navigate>(() => {})
export const useNavigate = () => useContext(NavCtx)
